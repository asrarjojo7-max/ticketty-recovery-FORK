#!/usr/bin/env python3
import hashlib, hmac, json, os, secrets, socket, subprocess, threading, time
from pathlib import Path

SOCKET_PATH=os.environ.get("TICKETTY_OPS_SOCKET","/run/ticketty/ops.sock")
SECRET_PATH=os.environ.get("TICKETTY_OPS_HMAC_FILE","/etc/ticketty/secrets/ticketty-ops-hmac")
STATE_DIR=Path(os.environ.get("TICKETTY_DEPLOYMENT_STATE_DIR","/var/lib/ticketty/deployment"))
STATE_FILE=STATE_DIR/"remote-ops.json"
AUDIT_FILE=STATE_DIR/"remote-ops.jsonl"
OPS_LOG_DIR=STATE_DIR/"operations"
OPS_GROUP=os.environ.get("TICKETTY_OPS_GROUP","ticketty-ops")
TICKETTY_BIN=os.environ.get("TICKETTY_BIN","/usr/local/bin/ticketty")
REQUEST_TTL=60
PLAN_TTL=600
MAX_LINE=262144
ALLOWED={"STATUS","PLAN_UPDATE","CANCEL_PLAN","EXECUTE_UPDATE","OPERATION_STATUS"}

def now(): return int(time.time())

def load_secret():
    value=Path(SECRET_PATH).read_text(encoding="utf-8").strip()
    if not value: raise RuntimeError("Ops secret is empty")
    return value.encode()
SECRET=load_secret()

def load_state():
    if not STATE_FILE.exists(): return {"nonces":{},"plans":{},"operations":{}}
    try:
        data=json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return {"nonces":data.get("nonces",{}),"plans":data.get("plans",{}),"operations":data.get("operations",{})}
    except (OSError,json.JSONDecodeError): return {"nonces":{},"plans":{},"operations":{}}
STATE=load_state()
STATE_LOCK=threading.RLock()

def save_state():
    with STATE_LOCK:
        STATE_DIR.mkdir(parents=True,exist_ok=True)
        tmp=STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(STATE,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
        os.chmod(tmp,0o600); tmp.replace(STATE_FILE)

def prune():
    with STATE_LOCK:
        t=now()
        STATE["nonces"]={k:v for k,v in STATE["nonces"].items() if int(v)>t}
        STATE["plans"]={k:v for k,v in STATE["plans"].items() if int(v.get("expires_at",0))>t}

def audit(actor,op,target,result,request_id,detail=None):
    STATE_DIR.mkdir(parents=True,exist_ok=True)
    row={"timestamp":now(),"actor":actor,"operation":op,"target":target,"result":result,"request_id":request_id}
    if detail: row["detail"]=detail
    with AUDIT_FILE.open("a",encoding="utf-8") as f: f.write(json.dumps(row,ensure_ascii=False,separators=(",",":"))+"\n")
    os.chmod(AUDIT_FILE,0o600)

def canonical(m):
    return json.dumps({"timestamp":m["timestamp"],"nonce":m["nonce"],"operation":m["operation"],"actor":m["actor"],"payload":m.get("payload",{})},ensure_ascii=False,separators=(",",":"))

def verify(m):
    prune()
    op=str(m.get("operation",""))
    if op not in ALLOWED: raise ValueError("operation not allowed")
    ts=int(m["timestamp"])
    if abs(now()-ts)>REQUEST_TTL: raise ValueError("stale request")
    nonce=str(m["nonce"])
    if nonce in STATE["nonces"]: raise ValueError("replayed request")
    expected=hmac.new(SECRET,canonical(m).encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,str(m.get("signature",""))): raise ValueError("bad signature")
    STATE["nonces"][nonce]=now()+REQUEST_TTL

def run(args,timeout):
    p=subprocess.run([TICKETTY_BIN,*args],capture_output=True,text=True,check=False,timeout=timeout,env=os.environ.copy())
    if p.returncode: raise RuntimeError(p.stderr.strip() or p.stdout.strip() or f"exit {p.returncode}")
    return p.stdout.strip()

def launch_update(plan_id, ref, actor, request_id):
    OPS_LOG_DIR.mkdir(parents=True,exist_ok=True)
    log_path=OPS_LOG_DIR/(plan_id+".log")
    env=os.environ.copy()
    handle=log_path.open("a",encoding="utf-8")
    process=subprocess.Popen([TICKETTY_BIN,"update","--non-interactive","--confirm","--ref",ref],stdout=handle,stderr=subprocess.STDOUT,text=True,env=env,start_new_session=True)
    with STATE_LOCK:
        STATE["operations"][plan_id]={"plan_id":plan_id,"ref":ref,"pid":process.pid,"status":"running","started_at":now(),"log_file":str(log_path)}
    save_state()
    audit(actor,"EXECUTE_UPDATE",ref,"started",request_id,{"plan_id":plan_id})

    def waiter():
        try:
            code=process.wait()
            status="success" if code==0 else "failed"
            with STATE_LOCK:
                STATE["operations"][plan_id]["status"]=status
                STATE["operations"][plan_id]["exit_code"]=code
                STATE["operations"][plan_id]["finished_at"]=now()
            save_state()
            audit(actor,"EXECUTE_UPDATE",ref,status,request_id,{"plan_id":plan_id,"exit_code":code,"log_file":str(log_path)})
        finally:
            handle.close()
    threading.Thread(target=waiter,daemon=True,name="ticketty-deploy-"+plan_id).start()
    return {"plan_id":plan_id,"ref":ref,"status":"running"}

def handle(m):
    verify(m); save_state()
    op=str(m["operation"]); actor=m.get("actor",{}); payload=m.get("payload",{}); rid=str(m.get("request_id",secrets.token_hex(8)))
    if op=="STATUS":
        result=json.loads(run(["status","--json"],30))
        result["remote_operations"]=[
            {
                "plan_id": v.get("plan_id"),
                "ref": v.get("ref"),
                "status": v.get("status"),
                "started_at": v.get("started_at"),
                "finished_at": v.get("finished_at"),
                "exit_code": v.get("exit_code"),
            }
            for v in list(STATE["operations"].values())[-10:]
        ]
        audit(actor,op,None,"success",rid); return result
    if op=="PLAN_UPDATE":
        with STATE_LOCK:
            if any(v.get("status")=="running" for v in STATE["operations"].values()):
                raise ValueError("another deployment is already running")
        plan=json.loads(run(["update","--plan"],30))
        if plan.get("update"):
            pid="plan-"+secrets.token_hex(8)
            with STATE_LOCK:
                STATE["plans"][pid]={"ref":plan["latest"],"created_at":now(),"expires_at":now()+PLAN_TTL,"status":"planned"}
            plan["plan_id"]=pid; save_state(); audit(actor,op,plan["latest"],"success",rid,{"plan_id":pid})
        else: audit(actor,op,None,"noop",rid)
        return plan
    if op=="CANCEL_PLAN":
        pid=str(payload.get("plan_id",""))
        with STATE_LOCK:
            plan=STATE["plans"].get(pid)
            if not plan or int(plan.get("expires_at",0))<now(): raise ValueError("unknown or expired plan")
            if plan.get("status")!="planned": raise ValueError("plan is no longer cancellable")
            plan["status"]="cancelled"
            ref=plan["ref"]
        save_state(); audit(actor,op,ref,"cancelled",rid,{"plan_id":pid})
        return {"plan_id":pid,"status":"cancelled"}
    if op=="OPERATION_STATUS":
        pid=str(payload.get("plan_id",""))
        with STATE_LOCK:
            operation=STATE["operations"].get(pid)
            plan=STATE["plans"].get(pid)
            if operation:
                result={
                    "plan_id":operation.get("plan_id"),
                    "ref":operation.get("ref"),
                    "status":operation.get("status"),
                    "started_at":operation.get("started_at"),
                    "finished_at":operation.get("finished_at"),
                    "exit_code":operation.get("exit_code"),
                }
            elif plan:
                result={"plan_id":pid,"ref":plan.get("ref"),"status":plan.get("status"),"expires_at":plan.get("expires_at")}
            else:
                raise ValueError("unknown operation")
        audit(actor,op,pid,"success",rid)
        return result

    if op=="EXECUTE_UPDATE":
        pid=str(payload.get("plan_id",""))
        with STATE_LOCK:
            plan=STATE["plans"].get(pid)
            if not plan or int(plan.get("expires_at",0))<now(): raise ValueError("unknown or expired plan")
            if plan.get("status")!="planned": raise ValueError("plan is no longer executable")
            if any(v.get("status")=="running" for v in STATE["operations"].values()): raise ValueError("another deployment is already running")
            plan["status"]="executing"
            ref=plan["ref"]
        save_state()
        return launch_update(pid,ref,actor,rid)
    raise ValueError("operation not allowed")

def serve():
    path=Path(SOCKET_PATH); path.parent.mkdir(parents=True,exist_ok=True)
    try: path.unlink()
    except FileNotFoundError: pass
    s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.bind(str(path)); os.chmod(path,0o660)
    try:
        import grp; os.chown(path,os.getuid(),grp.getgrnam(OPS_GROUP).gr_gid)
    except (KeyError,PermissionError): pass
    s.listen(8)
    while True:
        c,_=s.accept()
        with c:
            raw=b""
            while b"\n" not in raw and len(raw)<=MAX_LINE:
                chunk=c.recv(4096)
                if not chunk: break
                raw+=chunk
            try:
                if len(raw)>MAX_LINE: raise ValueError("request too large")
                m=json.loads(raw.split(b"\n",1)[0].decode("utf-8"))
                response={"ok":True,"result":handle(m)}
            except Exception as e: response={"ok":False,"error":str(e)}
            c.sendall((json.dumps(response,ensure_ascii=False,separators=(",",":"))+"\n").encode("utf-8"))

if __name__=="__main__": serve()
