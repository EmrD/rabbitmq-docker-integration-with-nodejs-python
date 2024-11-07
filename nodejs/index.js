const express = require("express");
const app = express();
const amqp = require("amqplib");
const { v4: uuidv4 } = require("uuid");

async function sendMessage(task, user, task_id, res) {
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    const queue = 'task_queue';
    const replyQueue = 'reply_queue';

    await channel.assertQueue(queue, { durable: false });
    await channel.assertQueue(replyQueue, { durable: false });

    const message = { task: task, user: user, task_id: task_id };
    const correlationId = uuidv4();  // Her istemci için benzersiz correlationId

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
        replyTo: replyQueue,
        correlationId: correlationId,  // correlationId ekleniyor
    });

    res.write("Mesaj sunucuya iletildi.\n");

    // Her istemci için benzersiz bir yanıt kontrolü yapılacak
    const responseEnded = { [correlationId]: false };

    // İlk gelen "docker_started" mesajı yalnızca 1. client'a verilecek
    let dockerStartedSent = false;

    // Yanıt beklemek için sadece bu correlationId'ye gelen mesajlar işlenecek
    channel.consume(replyQueue, (msg) => {
        if (msg && msg.properties.correlationId === correlationId && !responseEnded[correlationId]) {
            const message_response = msg.content.toString();

            // "gotit" mesajını işliyoruz
            if (message_response === "gotit") {
                channel.ack(msg);  // Mesajı onaylıyoruz
                res.write("Sunucu isleme aldi.\n");
                responseEnded[correlationId] = true;
            }
            
            // "docker_started" mesajı yalnızca 1. client için yazılacak
            if (message_response === "docker_started" && !dockerStartedSent) {
                res.write("Sunucu docker container'ini kurdu.\n");
                res.write("Gorev ID: " + task_id + "\n");
                dockerStartedSent = true;  // Docker container başladı mesajı sadece bir kez gönderilsin
            }

            // Eğer gelen mesaj docker logları ise, her iki client'a da gönderilir
            if (message_response.startsWith("message from docker for ID:")) {
                res.write(message_response + "\n");
            }
        }
    }, { noAck: false });  // Mesajları onaylıyoruz ve yalnızca bir kez alıyoruz
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
