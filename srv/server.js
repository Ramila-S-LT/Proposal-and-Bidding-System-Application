// const cds = require('@sap/cds');
// const express = require('express');
// const nodemailer = require('nodemailer');

// cds.on('bootstrap', (app) => {
//     app.post('/alert-webhook', express.json(), async (req, res) => {

//         console.log("SMTP_HOST : ", process.env.SMTP_HOST);
//         console.log('USER:', JSON.stringify(process.env.SMTP_USER),
//             'PASS length:', process.env.SMTP_PASS?.length)

//         const {subject, body, tags} = req.body || {};
//         const to = tags?.recipient

//         try {

//             const transporter = nodemailer.createTransport({
//                 host : process.env.SMTP_HOST,
//                 port : Number(process.env.SMTP_PORT || 587),
//                 auth : { user : process.env.SMTP_USER, pass : process.env.SMTP_PASS}
//             })

//             await transporter.sendMail({
//                 from : process.env.SMTP_USER, to, subject, text:body
//             })

//             res.sendStatus(200)

//         } catch(e) {

//             console.log(e)
//             res.sendStatus(500)

//         }
//     })
// })

const cds = require("@sap/cds");
const express = require("express");
const nodemailer = require("nodemailer");

cds.on("bootstrap", (app) => {
    app.use(express.json());

    app.post("/customer-verification", async (req, res) => {
        console.log("========================");
        console.log("Webhook Received");
        console.log("Body : ", req.body);

        const {subject, body, tags} = req.body || {};
        const to = tags?.customerEmail;

        if(!to) {
            return res.status(400).send("Customer email is missing");
        }

        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT || 587),
                secure: false,
                auth : {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            const info = await transporter.sendMail({
                from: process.env.SMTP_USER,
                to,
                subject: subject || "Customer Verification Successful",
                text : body || "You accounst is verified successfully."
            });

            console.log("Email send Successfully : ", info.messageId);
            return res.status(200).send("Webhook received successfully");
            
        }catch(error) {
            console.error("Email Sending failed : ", error.message);
            return res.status(500).send("Email sending failed");
        }

        
    })
})

module.exports = cds.server;
