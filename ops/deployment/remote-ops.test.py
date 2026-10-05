#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SERVER=ROOT/"ops/deployment/ops-server.py"

def canonical(message):
    return json.dumps({
        "timestamp": message["timestamp"],
        "nonce": message["nonce"],
        "operation": message["operation"],
        "actor": message["actor"],
        "payload": message.get("payload", {}),
    }, ensure_ascii=False, separators=(",", ":"))

def sign(secret, operation, payload=None, actor=None):
    import secrets
    message={
        "timestamp":int(time.time()),
        "nonce":secrets.token_hex(16),
        "operation":operation,
        "actor":actor or {"telegram_user_id":"test-user","telegram_chat_id":"test-chat"},
        "payload":payload or {},
        "request_id":secrets.token_hex(8),
    }
    message["signature"]=hmac.new(secret.encode(),canonical(message).encode(),hashlib.sha256).hexdigest()
    return message

def call(sock_path, message):
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as client:
        client.settimeout(5)
        client.connect(sock_path)
        client.sendall((json.dumps(message,separators=(",",":"))+"\n").encode())
        data=b""
        while b"\n" not in data:
            data += client.recv(4096)
        return json.loads(data.split(b"\n",1)[0].decode())

with tempfile.TemporaryDirectory() as temp:
    tmp=Path(temp)
    sock=tmp/"ops.sock"
    secret_path=tmp/"secret"
    state=tmp/"state"
    fake=tmp/"ticketty"
    marker=tmp/"executed"
    secret="integration-test-secret-please-ignore"
    secret_path.write_text(secret,encoding="utf-8")
    fake.write_text("""#!/usr/bin/env bash
if [[ "$1" == "status" ]]; then
  printf '{"ok":true,"release":"v-test","domain":"test.example","status":"READY","remote_ops":"active"}\n'
  exit 0
fi
if [[ "$1" == "update" && "$2" == "--plan" ]]; then
  printf '{"ok":true,"update":true,"current":"v-old","latest":"v-new","name":"Test release"}\n'
  exit 0
fi
if [[ "$1" == "update" ]]; then
  printf executed > "$MARKER"
  sleep 0.2
  exit 0
fi
exit 2
""",encoding="utf-8")
    fake.chmod(0o700)
    env=os.environ.copy()
    env.update({
        "TICKETTY_OPS_SOCKET":str(sock),
        "TICKETTY_OPS_HMAC_FILE":str(secret_path),
        "TICKETTY_DEPLOYMENT_STATE_DIR":str(state),
        "TICKETTY_OPS_GROUP":"missing-test-group",
        "TICKETTY_BIN":str(fake),
        "MARKER":str(marker),
    })
    process=subprocess.Popen([sys.executable,str(SERVER)],env=env)
    try:
        for _ in range(50):
            if sock.exists(): break
            time.sleep(0.05)
        assert sock.exists(), "ops socket did not start"

        status=sign(secret,"STATUS")
        response=call(str(sock),status)
        assert response["ok"] is True
        assert response["result"]["release"]=="v-test"

        replay=call(str(sock),status)
        assert replay["ok"] is False
        assert "replayed request" in replay["error"]

        plan=call(str(sock),sign(secret,"PLAN_UPDATE"))
        assert plan["ok"] is True
        plan_id=plan["result"]["plan_id"]

        cancelled=call(str(sock),sign(secret,"CANCEL_PLAN",{"plan_id":plan_id}))
        assert cancelled["ok"] is True
        assert cancelled["result"]["status"]=="cancelled"

        plan2=call(str(sock),sign(secret,"PLAN_UPDATE"))
        plan2_id=plan2["result"]["plan_id"]
        started=call(str(sock),sign(secret,"EXECUTE_UPDATE",{"plan_id":plan2_id}))
        assert started["ok"] is True
        assert started["result"]["status"]=="running"
        for _ in range(50):
            if marker.exists(): break
            time.sleep(0.05)
        assert marker.exists(), "deployment command was not launched"

        duplicate=call(str(sock),sign(secret,"EXECUTE_UPDATE",{"plan_id":plan2_id}))
        assert duplicate["ok"] is False
    finally:
        process.terminate()
        process.wait(timeout=5)

print("remote-ops integration test: PASS")