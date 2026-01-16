const webPush = require("web-push");

const vapidKeys = webPush.generateVAPIDKeys();

console.log("=======================================");
console.log("VAPID Keys Generated");
console.log("=======================================");
console.log("Add these to your .env file:");
console.log("");
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_MAILTO=mailto:admin@example.com`);
console.log("");
console.log("=======================================");
