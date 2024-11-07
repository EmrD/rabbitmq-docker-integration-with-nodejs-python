import os
import json
import time
task = os.environ.get("TASK_ID")
time.sleep(10)
print("message from docker for ID: " + json.loads(task)["task_id"])