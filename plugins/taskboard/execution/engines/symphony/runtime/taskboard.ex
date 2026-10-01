defmodule SymphonyElixir.Taskboard do
  @moduledoc "Taskboard execution queue adapter. No external tracker tools or credentials."
  @behaviour SymphonyElixir.Tracker
  alias SymphonyElixir.{Config, Workspace}
  alias SymphonyElixir.Tracker.Issue

  def validate_config(settings) do
    if settings.active_states == ["Ready"] and settings.terminal_states == [] and
         System.get_env("TASKBOARD_URL") not in [nil, ""] and
         System.get_env("TASKBOARD_TOKEN") not in [nil, ""] and
         System.get_env("TASKBOARD_RUNTIME_ID") not in [nil, ""] do
      :ok
    else
      {:error, :invalid_taskboard_configuration}
    end
  end

  def secret_environment_names(_), do: ["TASKBOARD_TOKEN", "BB_TOKEN", "BB_API_KEY", "LINEAR_API_KEY", "JIRA_API_TOKEN", "JIRA_TOKEN", "ATLASSIAN_API_TOKEN"]

  def request(method, path, body \\ nil) do
    url = String.trim_trailing(System.fetch_env!("TASKBOARD_URL"), "/") <> path
    options = [method: method, url: url, headers: [{"x-bb-plugin-token", System.fetch_env!("TASKBOARD_TOKEN")}],
               retry: false, redirect: false, receive_timeout: 10_000]
    options = if body, do: Keyword.put(options, :json, body), else: options
    case Req.request(options) do
      {:ok, %{status: status, body: payload}} when status in 200..299 -> {:ok, payload}
      _ -> {:error, :taskboard_unavailable}
    end
  end

  def queue(ids \\ nil) do
    body = %{"runtimeId" => System.fetch_env!("TASKBOARD_RUNTIME_ID")}
    request(:post, "/queue", if(ids, do: Map.put(body, "ids", ids), else: body))
  end

  def fetch_issues_by_states(states) do
    with {:ok, %{"runs" => runs, "configuration" => config}} <- queue(),
         true <- config["maxConcurrency"] == Config.settings!().agent.max_concurrent_agents do
      {:ok, runs |> Enum.map(&issue/1) |> Enum.filter(&(&1.state in states))}
    else
      _ -> {:error, :taskboard_queue_or_concurrency_configuration_invalid}
    end
  end

  def fetch_issues_by_ids(ids) do
    with {:ok, %{"runs" => runs}} <- queue(ids), do: {:ok, Enum.map(runs, &issue/1)}
  end

  def issue(run) do
    %Issue{id: run["id"], identifier: run["id"], title: run["request"]["title"],
      description: "Read .taskboard/execution-context.json. Implement approvedScope only.",
      state: if(run["dispatchable"], do: "Ready", else: "Held"), dispatchable: run["dispatchable"],
      branch_name: run["request"]["scope"]["branch"],
      native_ref: %{"generation" => run["generation"]}, labels: [], blocked_by: []}
  end

  def agent_tool_specs do
    [%{"name" => "taskboard_handoff", "description" => "Return a committed implementation to Taskboard for verification. Does not complete the task.",
       "inputSchema" => %{"type" => "object", "properties" => %{"summary" => %{"type" => "string"}, "pullRequestUrl" => %{"type" => "string"}}, "required" => ["summary"], "additionalProperties" => false}}]
  end

  def execute_agent_tool("taskboard_handoff", %{"summary" => summary} = arguments, opts) when is_binary(summary) do
    issue = Keyword.fetch!(opts, :issue)
    workspace = Path.join(Config.local_workspace_root(), Workspace.workspace_key(issue))
    with {"", 0} <- System.cmd("git", ["-c", "core.fsmonitor=false", "status", "--porcelain"], cd: workspace),
         {head, 0} <- System.cmd("git", ["rev-parse", "HEAD"], cd: workspace),
         {:ok, _} <- request(:post, "/events/" <> issue.id,
           %{"eventId" => "handoff-#{issue.native_ref["generation"]}-#{String.trim(head)}", "generation" => issue.native_ref["generation"],
             "state" => "implementation_complete", "head" => String.trim(head), "pr" => arguments["pullRequestUrl"]}) do
      response(true, "Implementation handed to Taskboard. Stop implementation; Taskboard will verify it.")
    else
      _ -> response(false, "Commit changes and ensure Taskboard is reachable before handing off.")
    end
  rescue
    _ -> response(false, "Implementation handoff failed.")
  end

  def execute_agent_tool(_, _, _), do: response(false, "Unsupported tool or invalid arguments.")
  defp response(success, text), do: %{"success" => success, "output" => text, "contentItems" => [%{"type" => "inputText", "text" => text}]}
end

defmodule SymphonyElixir.TaskboardReporter do
  @moduledoc "Reports structured runtime state and enforces the configured execution retry/time budget."
  use GenServer
  alias SymphonyElixir.{Config, Orchestrator, Taskboard}
  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  def init(_), do: (Process.send_after(self(), :poll, 1_000); {:ok, %{}})
  def handle_info(:poll, baselines) do
    next = if Config.settings!().tracker.kind == "taskboard", do: report(baselines), else: baselines
    Process.send_after(self(), :poll, 2_000)
    {:noreply, next}
  rescue
    _ -> Process.send_after(self(), :poll, 2_000); {:noreply, baselines}
  end

  defp report(baselines) do
    with {:ok, %{"runs" => runs, "configuration" => config}} <- Taskboard.queue(),
         %{running: running, retrying: retrying} = snapshot <- Orchestrator.snapshot() do
      Enum.reduce(runs, baselines, fn run, acc ->
        key = {run["id"], run["generation"]}
        baseline = Map.get(acc, key, run["retryCount"])
        active = Enum.find(running, &(&1.issue_id == run["id"]))
        retry = Enum.find(retrying, &(&1.issue_id == run["id"]))
        blocked = Enum.find(Map.get(snapshot, :blocked, []), &(&1.issue_id == run["id"]))
        attempts = baseline + if(retry, do: retry.attempt, else: 0)
        elapsed = case DateTime.from_iso8601(run["generationStartedAt"]) do
          {:ok, time, _} -> DateTime.diff(DateTime.utc_now(), time, :millisecond)
          _ -> 0
        end
        {state, error} = cond do
          run["state"] == "canceling" and is_nil(active) -> {"canceled", nil}
          run["state"] not in ["queued", "running", "retrying", "blocked"] -> {nil, nil}
          attempts - run["generationRetryBase"] > config["maxRetries"] -> {"failed", "Symphony retry budget exhausted"}
          elapsed > config["runTimeoutMs"] -> {"failed", "Symphony execution timeout"}
          blocked -> {"blocked", "Agent requires human input"}
          retry -> {"retrying", "Agent or workspace attempt failed; Symphony scheduled a retry"}
          active -> {"running", nil}
          true -> {nil, nil}
        end
        if state do
          identity = "#{run["generation"]}-#{state}-#{attempts}-#{if(active, do: active.session_id, else: "idle")}"
          event_id = "runtime-" <> Base.encode16(:crypto.hash(:sha256, identity), case: :lower)
          event = %{"eventId" => event_id,
            "generation" => run["generation"], "state" => state, "retryCount" => attempts, "error" => error,
            "runId" => if(active, do: active.session_id, else: nil)}
          Taskboard.request(:post, "/events/" <> run["id"], event)
        end
        Map.put(acc, key, baseline)
      end)
    else
      _ -> baselines
    end
  end
end
