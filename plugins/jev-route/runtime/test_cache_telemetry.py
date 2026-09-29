import unittest
from unittest.mock import Mock
from cache_telemetry import cache_result, provider_diagnostics, fingerprint, warm_input_choice
from route_memory import RouteMemory
from routing_policy import ASTRA,SOL,LUNA
class CacheTelemetryTests(unittest.TestCase):
 def test_cold_idle_changed_and_unexpected_are_separate(self):
  for opportunity,result in [('cold_start','cold_zero'),('idle_gap','idle_zero'),('changed_request','changed_zero'),('warm_prefix','unexpected_zero')]:
   self.assertEqual(cache_result({'cache_opportunity':opportunity},{'cached_input_tokens':0}),result)
  self.assertEqual(cache_result({},{}),'unknown');self.assertEqual(cache_result({},{'cached_input_tokens':1}),'hit')
 def test_allowlisted_provider_diagnostics_never_carry_content(self):
  self.assertEqual(provider_diagnostics({'type':'cache_miss','reason':{'secret':'data'},'prompt':'private','cache_missed_tokens':12}),{'type':'cache_miss','reason':'other','cache_missed_tokens':12})
  self.assertIsNone(provider_diagnostics({'type':'private'}))
 def test_diagnostic_comparison_does_not_change_request_fingerprint(self):
  a={'input':['private'],'prompt_cache_options':{'mode':'implicit'}};b={**a,'prompt_cache_options':{'mode':'implicit','comparison_response_id':'secret'}}
  self.assertEqual(fingerprint(a),fingerprint(b));self.assertNotIn('private',str(fingerprint(a)))
 def test_warm_pair_only_retained_when_capable_recent_and_cheaper(self):
  old={'pair':(ASTRA,'medium','default','apply'),'usage':{'input_tokens':100000,'cached_input_tokens':98000}}
  self.assertEqual(warm_input_choice(old,(SOL,'medium','default','apply'),0,True)[0][0],ASTRA)
  self.assertEqual(warm_input_choice(old,(LUNA,'low','default','apply'),0,True)[0][0],LUNA)
  self.assertEqual(warm_input_choice(old,(ASTRA,'low','default','apply'),0,True)[0][1],'medium')
  self.assertEqual(warm_input_choice(old,(SOL,'high','default','apply'),0,True)[0][0],SOL)
  self.assertEqual(warm_input_choice(old,(SOL,'medium','default','apply'),301,True)[0][0],SOL)
  self.assertEqual(warm_input_choice(old,(SOL,'medium','default','apply'),0,False)[0][0],SOL)
  self.assertEqual(warm_input_choice(old,(SOL,'medium','default','apply'),0,True,.5)[0][0],SOL)
 def test_router_cost_gate_uses_observed_usage_and_declines_large_growth(self):
  for growth,expected in [('new',ASTRA),('new'*100000,SOL)]:
   m=RouteMemory();p={'prompt_cache_key':'k','input':[{'role':'user','content':'x'*10000}]};step={'step_type':'tool_step'}
   choose=Mock(side_effect=[(ASTRA,'medium','default','apply'),(SOL,'medium','default','apply')])
   _,_,ticket=m.resolve(p,step,choose);m.observe(ticket,False,{'input_tokens':100000,'cached_input_tokens':98000})
   q={**p,'input':p['input']+[{'role':'user','content':growth}]}
   pair,_,_=m.resolve(q,step,choose);self.assertEqual(pair[0],expected)
 def test_late_usage_does_not_replace_newer_measurements_but_failure_still_counts(self):
  m=RouteMemory();p={'prompt_cache_key':'k','input':[{'role':'user','content':'x'}]};step={'step_type':'tool_step'};choose=Mock(return_value=(SOL,'medium','default','apply'))
  _,_,first=m.resolve(p,step,choose);_,_,second=m.resolve(p,step,choose)
  m.observe(second,False,{'input_tokens':200,'cached_input_tokens':150},'new')
  m.observe(first,False,{'input_tokens':100,'cached_input_tokens':0},'old')
  self.assertEqual(m.comparison_id(second),'new')
  m.observe(first,True);self.assertEqual(m.resolve(p,step,choose)[1]['reason'],'provider_failure')
if __name__=='__main__':unittest.main()
