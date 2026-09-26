import importlib.util
import unittest
import json
from unittest import mock
from tempfile import TemporaryDirectory
from pathlib import Path
spec=importlib.util.spec_from_file_location('native_benchmark',Path(__file__).resolve().parents[1]/'ops/native-benchmark.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class BenchmarkTests(unittest.TestCase):
 def test_budget_refuses_more_calls_and_tokens(self):
  b=module.Budget(allow_thresholds=True);b.calls=module.MAX_CALLS
  with self.assertRaises(RuntimeError):b.reserve({})
  b.calls=0;b.input=module.MAX_INPUT
  with self.assertRaises(RuntimeError):b.reserve({'input':'x'})
 def test_strict_mode_refuses_native_calls_before_network(self):
  b=module.Budget()
  with self.assertRaisesRegex(RuntimeError,'ceilings unavailable'):b.reserve({})
  with mock.patch.object(module,'call') as network, mock.patch('sys.argv',['bench','--benchmark','--confirm-quota-use','--output','unused.json']):
   with self.assertRaises(SystemExit):module.main()
   network.assert_not_called()
 def test_judge_calls_and_tokens_are_accounted_and_unknown_usage_stops(self):
  b=module.Budget(allow_thresholds=True);b.reserve({'model':'jev/auto'});b.record({'input_tokens':100,'output_tokens':5},{'input_tokens':20,'output_tokens':2},True)
  self.assertEqual((b.calls,b.input,b.output),(2,120,7))
  b.reserve({'model':'jev/auto'});b.record({'input_tokens':100,'output_tokens':5},None,False);self.assertEqual(b.calls,3)
  b.reserve({})
  with self.assertRaisesRegex(RuntimeError,'usage unavailable'):b.record({})
 def test_interrupted_benchmark_keeps_completed_rows_and_atomic_checkpoint(self):
  rows=[];b=module.Budget(allow_thresholds=True)
  reply={'status':200,'response_status':'completed','usage':{'input_tokens':1,'output_tokens':1},'elapsed_ms':1,'output':[{'type':'function_call','name':'submit_answer','call_id':'c','arguments':'{"answer":"idle_zero"}'}]}
  with TemporaryDirectory() as directory:
   output=Path(directory)/'report.json';report={'results':rows};b.checkpoint=lambda:module.save_report(output,report,b,{'calls':0,'input':0,'output':0})
   with mock.patch.object(module,'call',side_effect=[reply,RuntimeError('Benchmark budget exhausted')]):
    with self.assertRaisesRegex(RuntimeError,'budget exhausted'):module.benchmark(b,'context','run',rows)
   persisted=json.loads(output.read_text());self.assertTrue(persisted['results'][0]['passed']);self.assertEqual(persisted['results'][1]['state'],'interrupted')
 def test_interrupted_probe_keeps_baseline_usage(self):
  rows=[];b=module.Budget(allow_thresholds=True)
  with mock.patch.object(module,'call',side_effect=[{'status':200,'response_status':'completed','id':'r','usage':{'input_tokens':10,'output_tokens':1}},RuntimeError('stopped')]):
   with self.assertRaises(RuntimeError):module.run_probe(b,'context','run',rows,[])
  self.assertEqual(rows[0]['baseline_usage']['input_tokens'],10)
 def test_answer_grader_requires_one_named_function_call(self):
  self.assertEqual(module.answer_of([]),(None,None))
  call={'type':'function_call','name':'submit_answer','call_id':'c','arguments':'{"answer":"2"}'}
  self.assertEqual(module.answer_of([call]),('2','c'))
  self.assertEqual(module.answer_of([call,call]),(None,None))
  self.assertEqual(module.answer_of([{**call,'arguments':'[]'}]),(None,None))
 def test_arms_use_no_filesystem_or_network_tools(self):
  self.assertEqual(module.TOOL['name'],'submit_answer');self.assertEqual(len(module.TASKS),3)
  self.assertTrue(all(len(task[2])==3 for task in module.TASKS))
if __name__=='__main__':unittest.main()
