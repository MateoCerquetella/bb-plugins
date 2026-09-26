import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('native_benchmark',Path(__file__).resolve().parents[1]/'ops/native-benchmark.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class BenchmarkTests(unittest.TestCase):
 def test_budget_refuses_more_calls_and_tokens(self):
  b=module.Budget();b.calls=module.MAX_CALLS
  with self.assertRaises(RuntimeError):b.reserve({})
  b.calls=0;b.input=module.MAX_INPUT
  with self.assertRaises(RuntimeError):b.reserve({'input':'x'})
 def test_answer_grader_requires_one_named_function_call(self):
  self.assertEqual(module.answer_of([]),(None,None))
  call={'type':'function_call','name':'submit_answer','call_id':'c','arguments':'{"answer":"2"}'}
  self.assertEqual(module.answer_of([call]),('2','c'))
  self.assertEqual(module.answer_of([call,call]),(None,None))
 def test_arms_use_no_filesystem_or_network_tools(self):
  self.assertEqual(module.TOOL['name'],'submit_answer');self.assertEqual(len(module.TASKS),3)
  self.assertTrue(all(len(task[2])==3 for task in module.TASKS))
if __name__=='__main__':unittest.main()
