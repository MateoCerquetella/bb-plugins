defmodule SymphonyElixir.TaskboardTest do
  use SymphonyElixir.TestSupport
  alias SymphonyElixir.Taskboard

  defmodule Queue do
    def init(opts), do: opts
    def call(conn, _) do
      if Plug.Conn.get_req_header(conn, "x-bb-plugin-token") == ["fixture-token"] do
        run = %{"id" => "tb_" <> String.duplicate("a", 32), "generation" => 1, "dispatchable" => true,
          "request" => %{"title" => "Approved task", "scope" => %{"branch" => "bb/test"}}}
        conn |> Plug.Conn.put_resp_content_type("application/json") |> Plug.Conn.send_resp(200, Jason.encode!(%{"runs" => [run], "configuration" => %{"maxConcurrency" => 10}}))
      else
        Plug.Conn.send_resp(conn, 403, "{}")
      end
    end
  end

  setup do
    previous = for key <- ["TASKBOARD_URL", "TASKBOARD_TOKEN", "TASKBOARD_RUNTIME_ID"], into: %{}, do: {key, System.get_env(key)}
    {:ok, server} = Bandit.start_link(plug: Queue, port: 0, ip: {127, 0, 0, 1})
    {:ok, {_ip, port}} = ThousandIsland.listener_info(server)
    System.put_env("TASKBOARD_URL", "http://127.0.0.1:#{port}")
    System.put_env("TASKBOARD_TOKEN", "fixture-token")
    System.put_env("TASKBOARD_RUNTIME_ID", "fixture")
    on_exit(fn -> Enum.each(previous, fn {key, value} -> restore_env(key, value) end) end)
    :ok
  end

  test "registry selects the actual Taskboard adapter and secrets are filtered" do
    assert {:ok, Taskboard} = Tracker.adapter_for_kind("taskboard")
    assert :ok = Taskboard.validate_config(%{active_states: ["Ready"], terminal_states: []})
    assert {:error, _} = Taskboard.validate_config(%{active_states: ["Todo"], terminal_states: ["Done"]})
    assert "TASKBOARD_TOKEN" in Taskboard.secret_environment_names(%{})
    assert [%{"name" => "taskboard_handoff"}] = Taskboard.agent_tool_specs()
    refute Taskboard.execute_agent_tool("linear_graphql", %{}, []) ["success"]
  end

  test "polls the authenticated queue and maps only eligible requests to Ready" do
    assert {:ok, [issue]} = Taskboard.fetch_issues_by_ids(["tb_" <> String.duplicate("a", 32)])
    assert issue.state == "Ready"
    assert issue.dispatchable
    assert issue.native_ref == %{"generation" => 1}
    assert {:ok, [^issue]} = Taskboard.fetch_issues_by_states(["Ready"])
    assert {:ok, []} = Taskboard.fetch_issues_by_states(["Done"])
    held = Taskboard.issue(%{"id" => issue.id, "generation" => 2, "dispatchable" => false, "request" => %{"title" => "Task", "scope" => %{"branch" => "bb/test"}}})
    assert held.state == "Held"
    refute held.dispatchable
  end

  test "unavailable or rejected queue is an error, never an empty successful poll" do
    System.put_env("TASKBOARD_TOKEN", "invalid")
    assert {:error, :taskboard_unavailable} = Taskboard.fetch_issues_by_ids(["id"])
  end
end
