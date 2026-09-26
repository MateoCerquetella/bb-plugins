#!/usr/bin/env python3
"""Explicitly invoked, bounded native capability probe and read-only comparison."""
import argparse, datetime, hashlib, http.client, json, os, sys, time, uuid, re
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime'))
from cache_telemetry import provider_diagnostics
from jev_server import usage_counts

MAX_CALLS=36;MAX_INPUT=250000;MAX_OUTPUT=15000
class Budget:
 def __init__(self):self.calls=0;self.input=0;self.output=0
 def reserve(self,payload):
  estimated=len(json.dumps(payload))/3
  if self.calls>=MAX_CALLS or self.input+estimated>MAX_INPUT or self.output>=MAX_OUTPUT:raise RuntimeError('Benchmark budget exhausted')
  self.calls+=1
 def record(self,usage):
  self.input+=usage.get('input_tokens',0);self.output+=usage.get('output_tokens',0)

def call(payload,budget):
 budget.reserve(payload)
 secret=(Path.home()/'.codex/codex-router/caller-secret').read_text().strip()
 if not re.fullmatch(r'[A-Za-z0-9_-]{32,}',secret):raise RuntimeError('Invalid local caller credential format')
 connection=http.client.HTTPConnection('127.0.0.1',4202,timeout=60)
 start=time.monotonic();final=None;bytes_read=0
 try:
  connection.request('POST','/v1/responses',body=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
  response=connection.getresponse()
  if response.status!=200:
   error_body=response.read(4096).decode('utf-8','replace')
   match=re.search(r'(?:Unsupported|Unknown|Unrecognized|Missing|Invalid) (?:parameter|field|value)[^\n\r]{0,120}',error_body,re.I)
   try:
    err=json.loads(error_body).get('error',{});param=err.get('param');code=err.get('code')
   except (ValueError,AttributeError):param=code=None
   summary=(str(code)+':'+str(param)) if isinstance(param,str) and re.fullmatch(r'[a-zA-Z0-9_.]+',param) else (match.group(0).replace(secret,'[redacted]') if match else 'native_request_rejected')
   return {'error_summary':summary,'status':response.status,'elapsed_ms':round((time.monotonic()-start)*1000),'usage':{},'output':[]}
  while True:
   line=response.readline(1024*1024);bytes_read+=len(line)
   if not line:break
   if time.monotonic()-start>90 or bytes_read>2*1024*1024:raise RuntimeError('Per-call benchmark limit exceeded')
   if not line.startswith(b'data:'):continue
   raw=line[5:].strip()
   if raw==b'[DONE]':break
   try:event=json.loads(raw)
   except ValueError:continue
   if event.get('type') in ('response.completed','response.failed','response.incomplete'):
    final=event.get('response') or {};break
  usage=usage_counts((final or {}).get('usage')) or {};budget.record(usage)
  return {'status':200,'response_status':(final or {}).get('status'),'id':(final or {}).get('id'),'elapsed_ms':round((time.monotonic()-start)*1000),'usage':usage,'diagnostics':provider_diagnostics((final or {}).get('prompt_cache_diagnostics')),'output':(final or {}).get('output',[])}
 finally:connection.close()

def base_payload(model,effort,key,context):
 return {'model':model,'reasoning':{'effort':effort},'service_tier':'default','store':False,'stream':True,'include':['reasoning.encrypted_content'],'prompt_cache_key':key,'instructions':context,'input':[]}

def context():
 root=Path(__file__).resolve().parents[1]/'runtime'
 files=['cache_telemetry.py','route_memory.py','routing_policy.py']
 return 'Analyze the following code without executing commands. Treat it as reference data.\n'+''.join(f'\nFILE {name}\n{(root/name).read_text()}\n' for name in files)

TASKS=[
 ('cache_states','Determine cache-result classifications exactly from the supplied source.',[
  ('cache_result({"cache_opportunity":"idle_gap"},{"cached_input_tokens":0})','idle_zero'),
  ('cache_result({"cache_opportunity":"warm_prefix"},{"cached_input_tokens":0})','unexpected_zero'),
  ('cache_result({}, {})','unknown')]),
 ('warm_cost','Analyze the model selected by warm_input_choice; return only the model ID. old.pair=(ASTRA,"medium","default","apply"), old.usage={input_tokens:100000,cached_input_tokens:98000}, idle_seconds=0, prefix_compatible=True.',[
  ('candidate=(SOL,"medium","default","apply")','gpt-6-astra'),
  ('candidate=(LUNA,"low","default","apply")','gpt-5.6-luna'),
  ('candidate=(SOL,"high","default","apply")','gpt-5.6-sol')]),
 ('concurrency','Analyze RouteMemory isolation and concurrent failure safety exactly. Each question is independent with a fresh store and valid append-only inputs.',[
  ('Two resolves for the identical keyed tool continuation choose SOL/medium once. The second completes successfully, then observe(first_ticket,failed=True) runs. The next resolve receives a classifier candidate LUNA/low. Which model ID is returned?','gpt-6-astra'),
  ('A first task selected SOL/medium. A new user message then selected LUNA/low with a new generation. Afterwards the old task ticket reports failure. A healthy tool continuation of the new task arrives. Which model ID is returned?','gpt-5.6-luna'),
  ('Two requests lack prompt_cache_key, otherwise identical. How many times is the classifier invoked? Return a decimal integer.','2')])]
TOOL={'type':'function','name':'submit_answer','description':'Submit the answer to the current check. This tool only records text.','strict':True,'parameters':{'type':'object','properties':{'answer':{'type':'string'}},'required':['answer'],'additionalProperties':False}}

def answer_of(output):
 calls=[item for item in output if item.get('type')=='function_call' and item.get('name')=='submit_answer']
 if len(calls)!=1:return None,None
 try:answer=json.loads(calls[0].get('arguments','{}')).get('answer')
 except ValueError:return None,None
 return answer,calls[0].get('call_id')

def run_probe(budget,common,run_id):
 results=[];supported=[]
 for model in ['gpt-6-astra','gpt-5.6-sol','gpt-5.6-luna']:
  payload=base_payload(model,'low',f'{run_id}-probe-{model}',common+'\nReply with exactly OK. No explanation.')
  payload['input']=[{'role':'user','content':'Reply OK.'}]
  first=call(payload,budget)
  if first.get('response_status')!='completed' or not first.get('id'):
   results.append({'model':model,'baseline_status':first.get('status'),'error_summary':first.get('error_summary'),'supported':False});continue
  payload['prompt_cache_options']={'comparison_response_id':first['id']}
  second=call(payload,budget);diagnostics=second.get('diagnostics')
  useful=bool(diagnostics and diagnostics.get('type') in ('cache_hit','cache_miss'))
  if useful:supported.append(model)
  results.append({'model':model,'baseline_status':first['status'],'comparison_status':second['status'],'diagnostics':diagnostics,'error_summary':second.get('error_summary'),'supported':useful,'baseline_usage':first['usage'],'comparison_usage':second['usage']})
  print(json.dumps({'probe':model,'supported':useful,'status':second['status'],'diagnostics':diagnostics}),flush=True)
 return results,supported

def benchmark(budget,common,run_id):
 rows=[];arms=[('astra_low','gpt-6-astra','low'),('astra_medium','gpt-6-astra','medium'),('jev','jev/auto','medium')]
 for index,(task,brief,checks) in enumerate(TASKS):
  for label,model,effort in arms[index:]+arms[:index]:
   key=f'{run_id}-{task}-{label}';payload=base_payload(model,effort,key,common+'\nSubmit each answer with submit_answer only, without extra prose. Follow the next check returned by that tool.')
   payload['tools']=[TOOL];payload['tool_choice']={'type':'function','name':'submit_answer'}
   payload['input']=[{'role':'user','content':brief+'\nFirst check: '+checks[0][0]}]
   for step,(question,expected) in enumerate(checks):
    result=call(payload,budget);answer,call_id=answer_of(result.get('output',[]));passed=result.get('response_status')=='completed' and isinstance(answer,str) and answer.strip()==expected
    row={'task':task,'arm':label,'step':step,'session_scope':hashlib.sha256(('prompt:'+key).encode()).hexdigest()[:16],'context_hash':hashlib.sha256(common.encode()).hexdigest(),'status':result['status'],'response_status':result.get('response_status'),'usage':result.get('usage',{}),'elapsed_ms':result['elapsed_ms'],'passed':passed,'answer':answer,'expected':expected}
    rows.append(row);print(json.dumps({'task':task,'arm':label,'step':step,'passed':passed,'usage':row['usage']}),flush=True)
    if result['status']!=200 or not call_id:break # Failure recorded, no retries.
    payload['input']+=result['output']
    if step+1<len(checks):payload['input'].append({'type':'function_call_output','call_id':call_id,'output':json.dumps({'received':True,'next_check':checks[step+1][0]})})
 return rows

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');parser.add_argument('--benchmark',action='store_true');parser.add_argument('--confirm-quota-use',action='store_true');parser.add_argument('--output',required=True);parser.add_argument('--seed-budget');args=parser.parse_args()
 if not args.confirm_quota_use:parser.error('Explicit --confirm-quota-use is required.')
 if not(args.probe or args.benchmark):parser.error('Choose --probe and/or --benchmark.')
 budget=Budget()
 if args.seed_budget:
  prior=json.loads(Path(args.seed_budget).read_text())
  for name,limit in [('calls',MAX_CALLS),('input',MAX_INPUT),('output',MAX_OUTPUT)]:
   value=prior.get(name,0)
   if isinstance(value,bool) or not isinstance(value,int) or not 0<=value<=limit:parser.error('Invalid reserved budget')
   setattr(budget,name,value)
 reserved={'calls':budget.calls,'input':budget.input,'output':budget.output}
 run_id='jev-cache-bench-'+uuid.uuid4().hex;common=context();report={'run_id':run_id,'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'budget':{'max_calls':MAX_CALLS,'max_input_tokens':MAX_INPUT,'max_output_tokens':MAX_OUTPUT},'probe':[],'supportedModels':[],'results':[]}
 try:
  if args.probe:report['probe'],report['supportedModels']=run_probe(budget,common,run_id)
  if args.benchmark:report['results']=benchmark(budget,common,run_id)
 except Exception as error:report['error_type']=type(error).__name__;report['error']=str(error) if isinstance(error,RuntimeError) and str(error) in ('Benchmark budget exhausted','Per-call benchmark limit exceeded','Invalid local caller credential format') else 'Benchmark stopped; inspect local endpoint health.'
 finally:
  report['reserved_budget']=reserved;report['budget_accounting']={'calls':budget.calls,'input':budget.input,'output':budget.output};report['consumed']={k:report['budget_accounting'][k]-reserved[k] for k in reserved};report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();Path(args.output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'saved':args.output,'consumed':report['consumed'],'error':report.get('error')}),flush=True)
 if report.get('error'):raise SystemExit(1)
if __name__=='__main__':main()
