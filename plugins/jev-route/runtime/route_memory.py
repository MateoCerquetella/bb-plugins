"""Bounded, process-local task routing. Stored state contains hashes, never prompts."""
import hashlib
import json
import threading
import time
from collections import OrderedDict

from routing_policy import TIERS, EFFORTS


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
    return {"history": digest(history), "count": len(history), "user": user,
            "config": digest(config), "parts": {k: digest(v) for k, v in config.items()}}, history


class RouteMemory:
    def __init__(self, max_entries=512, ttl=1800, clock=time.monotonic):
        self.max_entries, self.ttl, self.clock = max_entries, ttl, clock
        self._entries = OrderedDict()
        self._lock = threading.Lock()
        self._stripes = [threading.RLock() for _ in range(64)]
        self._generation = 0

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
            return choose(), {"reason": "shadow" if not enabled else "missing_key", "reused": False}, None
        snap, history = snapshot(payload)
        # Different sessions proceed concurrently; same-session classifiers serialize.
        with self._stripe(key):
            now = self.clock()
            with self._lock:
                old = self._entries.get(key)
                if old:
                    old = dict(old)
            expired = bool(old and now - old["touched"] >= self.ttl)
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
            with self._lock:
                if not reuse:
                    self._generation += 1
                generation = old["generation"] if reuse else self._generation
                self._entries[key] = {**snap, "pair": pair, "errors": errors if reuse else 0,
                                      "failed": False, "touched": self.clock(), "generation": generation}
                self._entries.move_to_end(key)
                while len(self._entries) > self.max_entries:
                    self._entries.popitem(last=False)
            observation = {"reason": reason, "reused": reuse, "changes": changes,
                           "config_hash": snap["config"], "history_items": snap["count"],
                           "model_changed": bool(old and pair[0] != old["pair"][0]),
                           "effort_changed": bool(old and pair[1] != old["pair"][1]),
                           "configuration_fields_changed": [k for k in snap["parts"] if old and snap["parts"][k] != old["parts"][k]],
                           "provider_diagnosis": False}
            return pair, observation, (key, generation)

    def observe(self, ticket, failed):
        if not ticket or not failed:
            return
        key, generation = ticket
        with self._stripe(key), self._lock:
            entry = self._entries.get(key)
            if entry and entry["generation"] == generation:
                entry["failed"] = True
