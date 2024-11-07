import docker
import pika
import os
import time

client = docker.from_env()
connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
channel = connection.channel()
channel.queue_declare(queue='task_queue')
current_path = os.path.abspath("./")

def start_docker(task_id, ch, method, properties, body):
    try:
        container = client.containers.run(
            "python:3.9", 
            command="python /usr/src/app/container.py",
            volumes={
                current_path: {"bind": "/usr/src/app", "mode": "ro"}
            },
            detach=True,
            environment={"TASK_ID": task_id},
            auto_remove=False,
        )

        if container is None:
            raise ValueError(f"Failed to start Docker container for task {task_id}")
        
        print(f"Started container with ID: {container.id}")

        container_info = client.containers.get(container.id)
        if container_info.status != 'running':
            raise ValueError(f"Container {container.id} is not running")
        
        ch.basic_publish(
            exchange='',
            routing_key=properties.reply_to,
            properties=pika.BasicProperties(
                correlation_id=properties.correlation_id
            ),
            body="docker_started"
        )

        for line in container.logs(stream=True):
            log_message = f"{line.strip().decode('utf-8')}"
            print(log_message)

            ch.basic_publish(
                exchange='',
                routing_key=properties.reply_to,
                properties=pika.BasicProperties(
                    correlation_id=properties.correlation_id
                ),
                body=log_message
            )

    except Exception as e:
        print(f"Error in start_docker: {str(e)}")
        container_logs = container.logs()
        print(f"Container logs: {container_logs.decode('utf-8')}")
        raise

def callback(ch, method, properties, body):
    print(f"Received message: {body.decode()}")
    try:
        task_id = body.decode()
        start_docker(task_id, ch, method, properties, body)
        
        ch.basic_publish(
            exchange='',
            routing_key=properties.reply_to,
            properties=pika.BasicProperties(
                correlation_id=properties.correlation_id  # correlationId ile yanıt gönder
            ),
            body="gotit"
        )
    except Exception as e:
        print(f"Error in callback: {str(e)}")

channel.basic_consume(queue='task_queue', on_message_callback=callback, auto_ack=True)

print(' [*] Waiting for messages. To exit press CTRL+C')
channel.start_consuming()
