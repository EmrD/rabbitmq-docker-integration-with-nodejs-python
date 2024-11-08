//index.js

const express = require("express");
const app = express();
const amqp = require("amqplib");
const { v4: uuidv4 } = require("uuid");

async function sendMessage(task, user, task_id, res) {
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    const queue = 'task_queue';

    await channel.assertQueue(queue, { durable: false });

    const replyQueue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
    const message = { task: task, user: user, task_id: task_id };
    const correlationId = uuidv4();  

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
        replyTo: replyQueue.queue,
        correlationId: correlationId,
    });

    res.write("Mesaj sunucuya iletildi.\n");

    const responseEnded = { [correlationId]: false };
    let dockerStartedSent = false;

    channel.consume(replyQueue.queue, (msg) => {
        if (msg && msg.properties.correlationId === correlationId && !responseEnded[correlationId]) {
            const message_response = msg.content.toString();

            if (message_response === "gotit") {
                channel.ack(msg);
                res.write("Sunucu isleme aldi.\n");
                responseEnded[correlationId] = true;
            }
            
            if (message_response === "docker_started" && !dockerStartedSent) {
                res.write("Sunucu docker container'ini kurdu.\n");
                res.write("Gorev ID: " + task_id + "\n");
                dockerStartedSent = true;
            }

            if (!message_response.includes("docker_started") && !message_response.includes("gotit")) {
                res.write(message_response + "\n");
            }
        }
    }, { noAck: false });
}

app.get("/", (req, res) => { res.send("Please use valid directories!") });

app.get("/start_task", async (req, res) => {
    const urlparam = new URLSearchParams(req.query);
    const task = urlparam.get("task");
    const user = urlparam.get("user");
    const task_id = uuidv4();

    try {
        await sendMessage(task, user, task_id, res);
    } catch (error) {
        res.status(500).send('Hata: ' + error.message);
    }
});

app.listen(3000, () => {
    console.log("NodeJS started on http://localhost:3000/*");
});
