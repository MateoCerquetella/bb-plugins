import concurrent.futures
import unittest
from unittest import mock
from route_memory import RouteMemory, session_key
from routing_policy import LUNA, SOL, ASTRA


def payload(key='session', more=None, **fields):
    return {'prompt_cache_key':key,'input':[{'role':'user','content':'task'}]+(more or []),'instructions':'stable',**fields}
TOOL={'step_type':'tool_step','errored':False}
PAIR=(SOL,'medium','default','apply')


class MemoryTests(unittest.TestCase):
    def test_reuse_isolated_and_missing_keys_do_not_share(self):
        memory=RouteMemory();choose=mock.Mock(return_value=PAIR)
        first=payload();memory.resolve(first,TOOL,choose)
        self.assertTrue(memory.resolve(payload(more=[{'type':'function_call_output','output':'ok'}]),TOOL,choose)[1]['reused'])
        memory.resolve(payload(key='other'),TOOL,choose)
        for _ in range(2):memory.resolve(payload(key=''),TOOL,choose)
        self.assertEqual(choose.call_count,4)

    def test_changes_expiry_and_eviction_reclassify(self):
        clock=mock.Mock(return_value=0);memory=RouteMemory(max_entries=1,ttl=10,clock=clock);choose=mock.Mock(return_value=PAIR)
        memory.resolve(payload(),TOOL,choose)
        self.assertEqual(memory.resolve(payload(instructions='changed'),TOOL,choose)[1]['reason'],'configuration_changed')
        self.assertEqual(memory.resolve(payload(input=[{'role':'user','content':'rewritten'}],instructions='changed'),TOOL,choose)[1]['reason'],'user_request_changed')
        clock.return_value=11
        self.assertEqual(memory.resolve(payload(),TOOL,choose)[1]['reason'],'expired')
        memory.resolve(payload(key='second'),TOOL,choose)
        self.assertEqual(memory.resolve(payload(),TOOL,choose)[1]['reason'],'new_session')
        self.assertEqual(len(memory._entries),1)

    def test_history_rewrite_and_provider_failure(self):
        memory=RouteMemory();choose=mock.Mock(return_value=PAIR)
        _,_,ticket=memory.resolve(payload(more=[{'type':'function_call_output','output':'first'}]),TOOL,choose)
        _,info,ticket=memory.resolve(payload(more=[{'type':'function_call_output','output':'changed'}]),TOOL,choose)
        self.assertIn('history_rewritten',info['changes'])
        memory.observe(ticket,True)
        pair,info,_=memory.resolve(payload(more=[{'type':'function_call_output','output':'changed'}]),TOOL,choose)
        self.assertEqual(info['reason'],'provider_failure');self.assertEqual(pair[0],ASTRA)

    def test_same_session_concurrency_chooses_once(self):
        memory=RouteMemory();choose=mock.Mock(return_value=PAIR)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results=list(pool.map(lambda _:memory.resolve(payload(),TOOL,choose),range(20)))
        self.assertEqual(choose.call_count,1)
        self.assertEqual(sum(result[1]['reused'] for result in results),19)

    def test_old_failure_ticket_does_not_poison_new_decision(self):
        memory=RouteMemory();choose=mock.Mock(return_value=PAIR)
        _,_,old=memory.resolve(payload(),TOOL,choose)
        memory.resolve(payload(more=[{'role':'user','content':'next task'}]),TOOL,choose)
        memory.observe(old,True)
        self.assertFalse(memory._entries[session_key(payload())]['failed'])

    def test_shadow_invalidates_state_and_new_task_can_downgrade(self):
        memory=RouteMemory();choose=mock.Mock(return_value=PAIR)
        memory.resolve(payload(),TOOL,choose)
        memory.resolve(payload(),TOOL,choose,enabled=False)
        self.assertFalse(memory._entries)
        pair,info,_=memory.resolve(payload(),TOOL,choose)
        self.assertEqual(info['reason'],'new_session')
        choose.return_value=(LUNA,'low','default','apply')
        pair,info,_=memory.resolve(payload(more=[{'role':'user','content':'new task'}]),TOOL,choose)
        self.assertEqual(pair[0],LUNA)

    def test_replayed_failed_tool_does_not_count_twice(self):
        memory=RouteMemory();choose=mock.Mock(return_value=PAIR)
        memory.resolve(payload(),TOOL,choose)
        bad=payload(more=[{'type':'function_call_output','output':'failed'}])
        step={**TOOL,'errored':True}
        memory.resolve(bad,step,choose)
        memory.resolve(bad,step,choose)
        self.assertEqual(choose.call_count,1)
        memory.resolve(payload(more=bad['input'][1:]+[{'type':'function_call_output','output':'failed again'}]),step,choose)
        self.assertEqual(choose.call_count,2)

    def test_no_plaintext_persisted_or_logged_and_caller_payload_untouched(self):
        memory=RouteMemory();p=payload(key='secret-session',instructions='secret prompt');original=repr(p)
        _,info,_=memory.resolve(p,TOOL,lambda:PAIR)
        self.assertEqual(repr(p),original)
        self.assertNotIn('secret',repr(memory._entries));self.assertNotIn('secret',repr(info))

if __name__=='__main__':unittest.main()
