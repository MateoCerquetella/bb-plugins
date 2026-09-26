#!/usr/bin/env python3
"""Explicitly invoked, bounded native capability probe and read-only comparison."""
import argparse, datetime, hashlib, http.client, json, os, sys, time, uuid, re, threading, socket, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime'))
from cache_telemetry import provider_diagnostics
from jev_server import usage_counts

MAX_CALLS=36;MAX_INPUT=250000;MAX_OUTPUT=15000
class Budget:
 def __init__(self,allow_thresholds=False):
  self.calls=0;self.input=0;self.output=0;self.allow_thresholds=allow_thresholds;self.checkpoint=lambda:None;self.events=[]
 def reserve(self,payload):
  if not self.allow_thresholds:raise RuntimeError('Native per-call token ceilings unavailable')
  encoded=json.dumps(payload).encode();reserved_calls=2 if payload.get('model')=='jev/auto' else 1
  estimated=len(encoded)/3
  if len(encoded)>128*1024:raise RuntimeError('Benchmark payload limit exceeded')
  if self.calls+reserved_calls>MAX_CALLS or self.input+estimated>MAX_INPUT or self.output+4096>MAX_OUTPUT:raise RuntimeError('Benchmark budget exhausted')
  self.calls+=reserved_calls;self.events.append({'state':'in_flight','reserved_calls':reserved_calls,'model':payload.get('model')});self.checkpoint()
 def record(self,usage,judge=None,judge_called=False):
  for counters in [usage,judge if judge_called else {'input_tokens':0,'output_tokens':0}]:
   if not isinstance(counters,dict) or not all(isinstance(counters.get(k),int) and not isinstance(counters[k],bool) and counters[k]>=0 for k in ('input_tokens','output_tokens')):raise RuntimeError('Native usage unavailable; benchmark stopped')
  self.input+=usage['input_tokens']+(judge or {}).get('input_tokens',0);self.output+=usage['output_tokens']+(judge or {}).get('output_tokens',0)
  event=self.events[-1];self.calls-=event['reserved_calls']-(1+int(judge_called));event.update(state='completed',usage_known=True,usage=usage,judge_usage=judge or {},judge_called=judge_called);self.checkpoint()


def judge_accounting(payload,seen):
 if payload.get('model')!='jev/auto':return {},False
 scope=hashlib.sha256(('prompt:'+payload['prompt_cache_key']).encode()).hexdigest()[:16]
 log=Path.home()/'.codex/codex-router/jev-router-live.jsonl'
 deadline=time.monotonic()+10
 while time.monotonic()<deadline:
  try:
   with log.open('rb') as stream:
    stream.seek(0,2);size=stream.tell();stream.seek(max(0,size-512*1024));lines=stream.read().decode('utf-8','replace').splitlines()
   for line in reversed(lines):
    try:row=json.loads(line)
    except ValueError:continue
    observation=row.get('cache_observation') or {};request_id=observation.get('request_id')
    if row.get('cache_scope')!=scope or not request_id or request_id in seen:continue
    seen.add(request_id);called=observation.get('classifier_called') is True
    usage=row.get('jev_usage') or {}
    if not called:return {},False
    if not all(isinstance(usage.get(k),int) and not isinstance(usage[k],bool) and usage[k]>=0 for k in ('input_tokens','output_tokens')):raise RuntimeError('Classifier usage unavailable; benchmark stopped')
    return usage,True
  except OSError:pass
  time.sleep(.05)
 raise RuntimeError('Classifier usage unavailable; benchmark stopped')


def save_report(output,report,budget,reserved):
 report['reserved_budget']=reserved;report['budget_accounting']={'calls':budget.calls,'input':budget.input,'output':budget.output};report['consumed']={k:report['budget_accounting'][k]-reserved[k] for k in reserved};report['attempts']=budget.events
 output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=output.parent,prefix=output.name+'.',delete=False) as stream:
  temp=Path(stream.name);json.dump(report,stream,indent=2);stream.write('\n')
 try:os.replace(temp,output)
 finally:temp.unlink(missing_ok=True)

def call(payload,budget):
 budget.reserve(payload)
 secret=(Path.home()/'.codex/codex-router/caller-secret').read_text().strip()
 if not re.fullmatch(r'[A-Za-z0-9_-]{32,}',secret):raise RuntimeError('Invalid local caller credential format')
 connection=http.client.HTTPConnection('127.0.0.1',4202,timeout=60)
 start=time.monotonic();final=None;bytes_read=0
 def cancel():
  try:
   sock=connection.sock
   if sock:sock.shutdown(socket.SHUT_RDWR)
  except OSError:pass
  connection.close()
 timer=threading.Timer(90,cancel);timer.daemon=True;timer.start()
 try:
  connection.request('POST','/v1/responses',body=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
  response=connection.getresponse()
  if response.status!=200:
   error_body=response.read(4096).decode('utf-8','replace')
   match=re.search(r'(?:Unsupported|Unknown|Unrecognized|Missing|Invalid) (?:parameter|field|value)[^\n\r]{0,120}',error_body,re.I)
   try:
    err=json.loads(error_body).get('error',{});param=err.get('param');code=err.get('code')
   except (ValueError,AttributeError):param=code=None
   safe_code=code if isinstance(code,str) and len(code)<=64 and re.fullmatch(r'[a-zA-Z0-9_.]+',code) else 'native_request_rejected'
   safe_param=param if isinstance(param,str) and len(param)<=128 and re.fullmatch(r'[a-zA-Z0-9_.]+',param) else None
   summary=safe_code+(':'+safe_param if safe_param else '')
   budget.events[-1].update(state='rejected',http_status=response.status,error_summary=summary);budget.checkpoint()
   raise RuntimeError('Native usage unavailable; benchmark stopped')
  while True:
   line=response.readline(1024*1024);bytes_read+=len(line)
   if not line:break
   if time.monotonic()-start>90 or bytes_read>2*1024*1024:raise RuntimeError('Per-call benchmark limit exceeded')
   if not line.startswith(b'data:'):continue
   raw=line[5:].strip()
   if raw==b'[DONE]':continue
   try:event=json.loads(raw)
   except ValueError:continue
   if event.get('type') in ('response.completed','response.failed','response.incomplete'):
    final=event.get('response') or {}
  usage=usage_counts((final or {}).get('usage')) or {}
  if not hasattr(budget,'seen_judge_requests'):budget.seen_judge_requests=set()
  network_ms=round((time.monotonic()-start)*1000);judge={};judge_called=False;accounting_error=None
  try:
   judge,judge_called=judge_accounting(payload,budget.seen_judge_requests);budget.record(usage,judge if judge_called else None,judge_called)
  except RuntimeError as error:
   accounting_error=str(error)
   if all(isinstance(usage.get(k),int) and not isinstance(usage[k],bool) and usage[k]>=0 for k in ('input_tokens','output_tokens')):
    budget.input+=usage['input_tokens'];budget.output+=usage['output_tokens']
   budget.events[-1].update(state='usage_unknown',usage_known=False,native_usage=usage);budget.checkpoint()
  return {'status':200,'response_status':(final or {}).get('status'),'id':(final or {}).get('id'),'elapsed_ms':network_ms,'accounting_error':accounting_error,'usage':usage,'judge_usage':judge,'judge_called':judge_called,'diagnostics':provider_diagnostics((final or {}).get('prompt_cache_diagnostics')),'output':(final or {}).get('output',[])}
 finally:timer.cancel();connection.close()

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
 try:arguments=json.loads(calls[0].get('arguments','{}'))
 except (ValueError,TypeError):return None,None
 if not isinstance(arguments,dict):return None,None
 answer=arguments.get('answer');call_id=calls[0].get('call_id')
 return (answer if isinstance(answer,str) else None),(call_id if isinstance(call_id,str) and call_id else None)

def run_probe(budget,common,run_id,results=None,supported=None):
 results=[] if results is None else results;supported=[] if supported is None else supported
 for model in ['gpt-6-astra','gpt-5.6-sol','gpt-5.6-luna']:
  payload=base_payload(model,'low',f'{run_id}-probe-{model}',common+'\nReply with exactly OK. No explanation.')
  payload['input']=[{'role':'user','content':'Reply OK.'}]
  row={'model':model,'supported':False};results.append(row);budget.checkpoint()
  first=call(payload,budget);row.update(baseline_status=first['status'],baseline_usage=first.get('usage',{}));budget.checkpoint()
  if first.get('response_status')!='completed' or not first.get('id'):
   row.update(error_summary=first.get('error_summary'));budget.checkpoint();continue
  payload['prompt_cache_options']={'comparison_response_id':first['id']}
  second=call(payload,budget);diagnostics=second.get('diagnostics')
  useful=bool(diagnostics and diagnostics.get('type') in ('cache_hit','cache_miss'))
  if useful:supported.append(model)
  row.update({'model':model,'baseline_status':first['status'],'comparison_status':second['status'],'diagnostics':diagnostics,'error_summary':second.get('error_summary'),'supported':useful,'baseline_usage':first['usage'],'comparison_usage':second['usage']});budget.checkpoint()
  print(json.dumps({'probe':model,'supported':useful,'status':second['status'],'diagnostics':diagnostics}),flush=True)
 return results,supported

def benchmark(budget,common,run_id,rows=None,steps=2):
 rows=[] if rows is None else rows;arms=[('astra_low','gpt-6-astra','low'),('astra_medium','gpt-6-astra','medium'),('jev','jev/auto','medium')]
 for index,(task,brief,checks) in enumerate(TASKS):
  checks=checks[:steps]
  for label,model,effort in arms[index:]+arms[:index]:
   key=f'{run_id}-{task}-{label}';payload=base_payload(model,effort,key,common+'\nSubmit each answer with submit_answer only, without extra prose. Follow the next check returned by that tool.')
   payload['tools']=[TOOL];payload['tool_choice']={'type':'function','name':'submit_answer'}
   payload['input']=[{'role':'user','content':brief+'\nFirst check: '+checks[0][0]}]
   for step,(question,expected) in enumerate(checks):
    try:result=call(payload,budget)
    except BaseException:
     rows.append({'task':task,'arm':label,'step':step,'passed':False,'state':'interrupted','usage_known':False});budget.checkpoint();raise
    answer,call_id=answer_of(result.get('output',[]));passed=result.get('response_status')=='completed' and call_id is not None and isinstance(answer,str) and answer.strip()==expected
    row={'task':task,'arm':label,'step':step,'session_scope':hashlib.sha256(('prompt:'+key).encode()).hexdigest()[:16],'context_hash':hashlib.sha256(common.encode()).hexdigest(),'status':result['status'],'response_status':result.get('response_status'),'usage':result.get('usage',{}),'elapsed_ms':result['elapsed_ms'],'judge_usage':result.get('judge_usage',{}),'judge_called':result.get('judge_called',False),'accounting_error':result.get('accounting_error'),'passed':passed,'answer':answer,'expected':expected}
    rows.append(row);budget.checkpoint();print(json.dumps({'task':task,'arm':label,'step':step,'passed':passed,'usage':row['usage']}),flush=True)
    if result.get('accounting_error'):raise RuntimeError(result['accounting_error'])
    if result['status']!=200 or not call_id:break # Failure recorded, no retries.
    payload['input']+=result['output']
    if step+1<len(checks):payload['input'].append({'type':'function_call_output','call_id':call_id,'output':json.dumps({'received':True,'next_check':checks[step+1][0]})})
 return rows

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');parser.add_argument('--benchmark',action='store_true');parser.add_argument('--confirm-quota-use',action='store_true');parser.add_argument('--output',required=True);parser.add_argument('--seed-budget');parser.add_argument('--allow-token-stop-thresholds',action='store_true');parser.add_argument('--steps',type=int,choices=[2,3],default=2);args=parser.parse_args()
 if not args.confirm_quota_use:parser.error('Explicit --confirm-quota-use is required.')
 if not args.allow_token_stop_thresholds:parser.error('Native Codex cannot enforce per-call token ceilings. Explicit --allow-token-stop-thresholds accepts that an in-flight call may exceed a token stop threshold.')
 if not(args.probe or args.benchmark):parser.error('Choose --probe and/or --benchmark.')
 budget=Budget(allow_thresholds=args.allow_token_stop_thresholds)
 if args.seed_budget:
  prior=json.loads(Path(args.seed_budget).read_text())
  for name,limit in [('calls',MAX_CALLS),('input',MAX_INPUT),('output',MAX_OUTPUT)]:
   value=prior.get(name,0)
   if isinstance(value,bool) or not isinstance(value,int) or not 0<=value<=limit:parser.error('Invalid reserved budget')
   setattr(budget,name,value)
 reserved={'calls':budget.calls,'input':budget.input,'output':budget.output}
 run_id='jev-cache-bench-'+uuid.uuid4().hex;common=context();report={'run_id':run_id,'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'budget':{'max_calls':MAX_CALLS,'input_stop_tokens':MAX_INPUT,'output_stop_tokens':MAX_OUTPUT,'hard_per_call_token_ceiling':False,'steps_per_task':args.steps},'probe':[],'supportedModels':[],'results':[]}
 budget.checkpoint=lambda:save_report(args.output,report,budget,reserved)
 budget.checkpoint()
 try:
  if args.probe:run_probe(budget,common,run_id,report['probe'],report['supportedModels'])
  if args.benchmark:benchmark(budget,common,run_id,report['results'],args.steps)
 except BaseException as error:report['error_type']=type(error).__name__;report['error']=str(error) if isinstance(error,RuntimeError) and str(error) in ('Benchmark budget exhausted','Per-call benchmark limit exceeded','Invalid local caller credential format','Native per-call token ceilings unavailable','Native usage unavailable; benchmark stopped','Classifier usage unavailable; benchmark stopped','Benchmark payload limit exceeded') else 'Benchmark stopped; inspect local endpoint health.'
 finally:
  report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();budget.checkpoint();print(json.dumps({'saved':args.output,'consumed':report['consumed'],'error':report.get('error')}),flush=True)
 if report.get('error'):raise SystemExit(1)
if __name__=='__main__':main()
