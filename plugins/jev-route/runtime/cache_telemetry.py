"""Content-free cache telemetry and conservative published-rate input proxies."""
import hashlib
import json
import struct

INPUT_CREDITS = {'gpt-5.6-luna': (5.0, .5), 'gpt-5.6-sol': (100.0, 10.0), 'gpt-6-astra': (250.0, 25.0)}
RATE_DATE = '2026-09-25'
DIAGNOSTIC_TYPES = {'cache_hit', 'cache_miss', 'comparison_response_not_found', 'unavailable'}
REASONS = {'model_changed', 'prompt_cache_key_changed', 'service_tier_changed', 'tools_changed',
           'text_format_changed', 'reasoning_effort_changed', 'instructions_changed', 'input_prefix_changed',
           'cache_expired', 'cache_entry_unavailable'}


def nonnegative(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def canonical(value):
    if value is None: return ['null']
    if isinstance(value, bool): return ['bool', value]
    if isinstance(value, (int, float)): return ['number', struct.pack('>d', float(value)).hex()]
    if isinstance(value, str): return ['string', value]
    if isinstance(value, list): return ['array', [canonical(v) for v in value]]
    if isinstance(value, dict): return ['object', [[k, canonical(value[k])] for k in sorted(value)]]
    return ['unknown']


def hashed(value):
    return hashlib.sha256(json.dumps(canonical(value), ensure_ascii=True, separators=(',', ':')).encode()).hexdigest()


def fingerprint(payload):
    history = payload.get('input')
    items = history if isinstance(history, list) else [history]
    options = payload.get('prompt_cache_options')
    options = dict(options) if isinstance(options, dict) else options
    if isinstance(options, dict): options.pop('comparison_response_id', None)
    return {'input_hash': hashed(history), 'instructions_hash': hashed(payload.get('instructions')),
            'tools_hash': hashed(payload.get('tools')), 'reasoning_hash': hashed(payload.get('reasoning')),
            'text_hash': hashed(payload.get('text')), 'cache_options_hash': hashed(options),
            'history_items': len(items), 'reasoning_items': sum(isinstance(x, dict) and x.get('type') == 'reasoning' for x in items)}


def provider_diagnostics(value):
    if not isinstance(value, dict) or value.get('type') not in DIAGNOSTIC_TYPES: return None
    result = {'type': value['type']}
    if value.get('reason') is not None: result['reason'] = value['reason'] if isinstance(value['reason'], str) and value['reason'] in REASONS else 'other'
    for key in ('cache_missed_tokens', 'comparison_reusable_tokens'):
        number = nonnegative(value.get(key))
        if number is not None: result[key] = number
    return result


def cache_result(observation, usage):
    cached = nonnegative((usage or {}).get('cached_input_tokens'))
    if cached is None: return 'unknown'
    if cached > 0: return 'hit'
    opportunity = observation.get('cache_opportunity')
    return {'cold_start':'cold_zero', 'idle_gap':'idle_zero', 'changed_request':'changed_zero', 'warm_prefix':'unexpected_zero'}.get(opportunity, 'untracked_zero')


def warm_input_choice(old, candidate, idle_seconds, prefix_compatible, growth_factor=1.0):
    """May retain a more capable pair, never downgrade a requested capability/effort."""
    from routing_policy import TIERS, EFFORTS
    if not old or not prefix_compatible or idle_seconds >= 300 or growth_factor < 0.9: return candidate, None
    previous = old['pair']; usage = old.get('usage') or {}
    if candidate[:2] == previous[:2] or TIERS.index(candidate[0]) > TIERS.index(previous[0]): return candidate, None
    if EFFORTS.index(candidate[1]) > EFFORTS.index(previous[1]): return candidate, None
    total = nonnegative(usage.get('input_tokens')); cached = nonnegative(usage.get('cached_input_tokens'))
    if not total or cached is None or cached > total: return candidate, None
    # Reduce confidence in old cache as idle time grows; require a 20% margin.
    fraction = cached / total * max(0, 1-idle_seconds/1800) * min(1.0, growth_factor)
    old_rate, old_cached = INPUT_CREDITS[previous[0]]
    warm = old_rate*(1-fraction)+old_cached*fraction
    cold = INPUT_CREDITS[candidate[0]][0]
    estimate = {'rate_date':RATE_DATE,'warm_input_credits_per_million':round(warm,4),
                'cold_input_credits_per_million':cold,'candidate_model':candidate[0],
                'prompt_growth_factor':round(growth_factor,4),'retained':warm <= cold*.8,'scope':'input_only_proxy_not_quota'}
    if estimate['retained']: return (previous[0],previous[1],candidate[2],candidate[3]+':warm_input_retained'), estimate
    return candidate, estimate
