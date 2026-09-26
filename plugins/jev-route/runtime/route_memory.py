"""Bounded, process-local task routing. Stored state contains hashes, never prompts."""
import hashlib
import json
import threading
import time
from collections import OrderedDict

from routing_policy import TIERS, EFFORTS
from cache_telemetry import warm_input_choice, nonnegative


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def session_key(payload):
    key = payload.get("prompt_cache_key")
    return hashlib.sha256(("prompt:" + key.strip()).encode()).hexdigest()[:16] if isinstance(key, str) and key.strip() else None


def snapshot(payload):
    items = payload.get("input")
    history = items if isinstance(items, list) else [items]
    user = None
    for index, item in enumerate(history):
        if isinstance(item, dict) and item.get("role") == "user":
            user = (index, digest(item))
    if isinstance(items, str):
        user = (0, digest(items))
    config = {key: payload.get(key) for key in
              ("instructions", "tools", "tool_choice", "text", "reasoning", "prompt_cache_options")}
    if isinstance(config.get("prompt_cache_options"), dict):
        config["prompt_cache_options"] = {k:v for k,v in config["prompt_cache_options"].items() if k != "comparison_response_id"}
    return {"history": digest(history), "count": len(history), "user": user,
            "prompt_chars": len(json.dumps({"input":items,"config":config},ensure_ascii=False,separators=(",", ":"))),
            "config": digest(config), "parts": {k: digest(v) for k, v in config.items()}}, history


class RouteMemory:
    def __init__(self, max_entries=512, ttl=1800, clock=time.monotonic):
        self.max_entries, self.ttl, self.clock = max_entries, ttl, clock
        self._entries = OrderedDict()
        self._lock = threading.Lock()
        self._stripes = [threading.RLock() for _ in range(64)]
        self._generation = 0
        self._request = 0

    def _stripe(self, key):
        return self._stripes[int(key[:8], 16) % len(self._stripes)]

    def invalidate(self, key):
        if key:
            with self._stripe(key), self._lock:
                self._entries.pop(key, None)

    def resolve(self, payload, step, choose, enabled=True):
        key = session_key(payload)
        if not enabled or not key:
            if key and not enabled:
                self.invalidate(key)
            return choose(), {"reason": "shadow" if not enabled else "missing_key", "reused": False, "cache_opportunity": "untracked"}, None
        snap, history = snapshot(payload)
        # Different sessions proceed concurrently; same-session classifiers serialize.
        with self._stripe(key):
            now = self.clock()
            with self._lock:
                old = self._entries.get(key)
                if old:
                    old = dict(old)
            idle = max(0, now-old["touched"]) if old else None
            expired = bool(old and idle >= self.ttl)
            changes = []
            if old:
                if snap["config"] != old["config"]:
                    changes.append("configuration_changed")
                if snap["user"] != old["user"]:
                    changes.append("user_request_changed")
                if snap["count"] < old["count"] or digest(history[:old["count"]]) != old["history"]:
                    changes.append("history_rewritten")
            errors = old.get("errors", 0) if old else 0
            if not old or snap["history"] != old["history"]:
                errors = errors + 1 if step.get("errored") else 0
            failure = bool(old and (old.get("failed") or errors >= 2))
            reason = ("new_session" if not old else "expired" if expired else
                      changes[0] if changes else "provider_failure" if old.get("failed") else
                      "repeated_tool_failure" if errors >= 2 else
                      "non_tool_boundary" if step.get("step_type") != "tool_step" else "continuation")
            reuse = reason == "continuation"
            pair = old["pair"] if reuse else choose()
            # Within the same task, failed execution must not be downgraded.
            if failure and not changes:
                model, effort, speed, gate = pair
                previous_model, previous_effort, _, _ = old["pair"]
                model = TIERS[max(TIERS.index(model), min(len(TIERS)-1, TIERS.index(previous_model)+1))]
                effort = EFFORTS[max(EFFORTS.index(effort), EFFORTS.index(previous_effort))]
                pair = (model, effort, speed, gate + ":escalation")
            cost_estimate = None
            if not reuse and not failure and old and not expired:
                pair, cost_estimate = warm_input_choice(old, pair, max(0, now-old.get("usage_at", float("-inf"))),
                    "configuration_changed" not in changes and "history_rewritten" not in changes,
                    old.get("usage_prompt_chars",0)/max(1,snap["prompt_chars"]))
            with self._lock:
                self._request += 1
                request_number = self._request
                if not reuse:
                    self._generation += 1
                generation = old["generation"] if reuse else self._generation
                self._entries[key] = {**snap, "pair": pair, "errors": errors if reuse else 0,
                                      "failed": False, "touched": self.clock(), "generation": generation,
                                      "usage": old.get("usage") if old and pair[:2] == old["pair"][:2] and not expired and "configuration_changed" not in changes and "history_rewritten" not in changes else None,
                                      "response_id": old.get("response_id") if old and pair[0] == old["pair"][0] else None,
                                      "observed_request": old.get("observed_request",0) if old else 0,
                                      "usage_at": old.get("usage_at", float("-inf")) if old else float("-inf"),
                                      "usage_prompt_chars": old.get("usage_prompt_chars",0) if old else 0}
                self._entries.move_to_end(key)
                while len(self._entries) > self.max_entries:
                    self._entries.popitem(last=False)
            observation = {"reason": reason, "reused": reuse, "changes": changes,
                           "config_hash": snap["config"], "history_items": snap["count"],
                           "model_changed": bool(old and pair[0] != old["pair"][0]),
                           "effort_changed": bool(old and pair[1] != old["pair"][1]),
                           "configuration_fields_changed": [k for k in snap["parts"] if old and snap["parts"][k] != old["parts"][k]],
                           "provider_diagnosis": False, "idle_seconds": round(idle,3) if idle is not None else None,
                           "cache_opportunity": "cold_start" if not old else "idle_gap" if expired else
                           "changed_request" if "configuration_changed" in changes or "history_rewritten" in changes or pair[:2] != old["pair"][:2] else "warm_prefix",
                           "input_cost_estimate": cost_estimate}
            return pair, observation, (key, generation, request_number, snap["prompt_chars"])

    def comparison_id(self, ticket):
        if not ticket: return None
        key, generation = ticket[:2]
        with self._lock:
            entry = self._entries.get(key)
            return entry.get("response_id") if entry and entry["generation"] == generation else None

    def observe(self, ticket, failed, usage=None, response_id=None):
        if not ticket: return
        key, generation, request_number, prompt_chars = ticket
        with self._stripe(key), self._lock:
            entry = self._entries.get(key)
            if not entry or entry["generation"] != generation: return
            if failed: entry["failed"] = True
            if request_number >= entry["observed_request"]:
                entry["observed_request"] = request_number
                entry["usage_at"] = self.clock()
                entry["usage_prompt_chars"] = prompt_chars
                entry["usage"] = ({k:v for k,v in (usage or {}).items() if k in ("input_tokens","cached_input_tokens") and nonnegative(v) is not None} if not failed else None)
                entry["response_id"] = response_id if not failed and isinstance(response_id,str) and 0 < len(response_id) <= 4096 else None
