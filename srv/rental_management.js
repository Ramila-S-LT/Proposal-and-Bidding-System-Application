
const cds = require("@sap/cds");
const { expand } = require("@sap/cds/lib/ql/cds-ql");
const ax = require('axios');
const https = require('https');

// BREVO EMAIL HELPER
// Sends the customer an email with the PDF attachment.

// async function sendBrevoEmail({ to, customerName, contractNumber, pdfBuffer }) {
//     const apiKey = process.env.BREVO_API_KEY;
//     const senderEmail = process.env.BREVO_SENDER_EMAIL;

//     if (!apiKey || !senderEmail) {
//         throw new Error(
//             "Brevo configuration is missing. Check BREVO_API_KEY and BREVO_SENDER_EMAIL."
//         );
//     }

//     const subject = `Rental confirmation - ${contractNumber}`;

//     const emailBody = [
//         `Dear ${customerName},`,
//         "",
//         `Your rental contract ${contractNumber} has been confirmed.`,
//         "Please find the rental contract PDF attached.",
//         "",
//         "Thank you.",
//         "GMMCO Team"
//     ].join("\n");

//     const response = await fetch("https://api.brevo.com/v3/smtp/email", {
//         method: "POST",
//         headers: {
//             accept: "application/json",
//             "api-key": apiKey,
//             "Content-Type": "application/json"
//         },
//         body: JSON.stringify({
//             sender: {
//                 email: senderEmail,
//                 name: "GMMCO Rental System"
//             },
//             to: [
//                 {
//                     email: to,
//                     name: customerName
//                 }
//             ],
//             subject,
//             textContent: emailBody,
//             attachment: [
//                 {
//                     name: `Rental-${contractNumber}.pdf`,
//                     content: pdfBuffer.toString("base64")
//                 }
//             ]
//         })
//     });

//     if (!response.ok) {
//         const errorText = await response.text();

//         console.error(
//             "Brevo email request failed:",
//             response.status,
//             errorText.slice(0, 1000)
//         );

//         throw new Error(
//             `Brevo email request failed with status ${response.status}.`
//         );
//     }

//     const result = await response.json();

//     console.log("Brevo accepted the rental confirmation email.");

//     return result;
// }

// CAP SERVICE HANDLERS

module.exports = cds.service.impl(async function () {
    // const { SELECT, INSERT, UPDATE } = cds.ql;

    // const conn = await cds.connect.to('ANS-Producer');
    // console.log("Conn : ", conn);
    
    const conn = await cds.connect.to('ANS-Producer');
    console.log("Conn : ", conn);
    

    const {
        Proposals,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;

    const masterEntities = cds.entities("Master.db") || {};
    const Customers = masterEntities.Customers;


    // SEND RENTAL CONFIRMATION
    // Sends one email with the rental contract PDF attached.
    // Call this after all equipment allocations succeed.
   

    this.on('checkRental', async (req, res) => {

        const data = await SELECT.from(RentalContracts).columns(['*', {ref: ['proposal'], expand: ['*']}, {ref: ['customer'], expand: ['*']}]).where({contractStatus : 'Active'});
        console.log("Data : ", data);

        

        const curDate = new Date().toISOString().split('T')[0];
        console.log("Current Date : ", curDate);


        for(let resultDate of data){
            console.log("Result Date : ", resultDate.endDate);
            console.log("Email : ", resultDate.customer.customerEmail);
            

            let duration = 0;

            console.log(`Dates : ${resultDate.endDate} - ${curDate}`);

            duration = new Date(resultDate.endDate) - new Date(curDate);
            console.log("Duration : ", duration);

            remainingDays = duration / (1000 * 60 * 60 * 24);
            console.log("Remaining Days : ", remainingDays);
            
            if(remainingDays <= 4){

                const tokens = await generateToken();
                console.log("Alert Token : ", tokens);
                const alert = await notifyCustomerVerification(resultDate, tokens);
                
            } 
            
        }
        
    });

     async function notifyCustomerVerification(resultDate, token) {
            console.log("Token : ", token);
            console.log("Email  inside customer : ", resultDate);
            
    
            await ax.post(
                'https://clm-sl-ans-live-ans-service-api.cfapps.us10.hana.ondemand.com/cf/producer/v1/resource-events',
                {
                    eventType : "Due_Remainder",
                    severity : "INFO",
                    subject: "Rental Contract Expiry Remainder - Action Required",
                    body: `This is a remainder notifications`,
                    category : "NOTIFICATION",
                    tags : {
                        customerEmail : resultDate.customer.customerEmail,
                        contractNumber : resultDate.contractNumber,
                        endDate :  resultDate.endDate
                        
                    },
                    resource : {
                        resourceName : "GMMCOApplication",
                        resourceType : "Application",
                        resourceInstance : "1",
                        tags : {
                            appliation : "Proposal-Creation"
                        }
                    }
                },
    
                {
                    headers : {
                        Authorization : `Bearer ${token}`,
                        "Content-Type" : "application/json"
                    },
                    httpsAgent : new https.Agent({
                        rejectUnauthorized: false
                    }),
                    proxy : false
                }
            );
    
            console.log("Customer Verification event sent successfully");
            
        }

    async function generateToken(){
        console.log("Token Function");
        console.log("Client ID : ", process.env.client_id);
        console.log("Clinet Secret : ", process.env.client_secret);
        
        const tokenResponse = await conn.send({
            method: "POST",
            path: '/oauth/token',
            headers : {
                "Content-Type" : "application/x-www-form-urlencoded"
            },
            data: "grant_type=client_credentials"
        });

        const token = tokenResponse.access_token;
        console.log("Token  : ", token);
        
        return token;
    };


    this.on("sendRentalConfirmation", async (req) => {
        const { rentalContract_ID } = req.data;

        console.log(
            "sendRentalConfirmation called:",
            rentalContract_ID
        );

        if (!rentalContract_ID) {
            return {
                success: false,
                message: "Rental contract ID is required."
            };
        }

        try {
            const { contract, customer, buffer } =
                await buildRentalPdf(rentalContract_ID);

            const customerEmail =
                String(customer.customerEmail || "").trim();

            const customerName =
                String(customer.companyName || "Customer");

            if (!customerEmail) {
                return {
                    success: false,
                    message:
                        "Customer email is not available for this contract."
                };
            }

            // 1. Send the customer email through Brevo.
            await sendBrevoEmail({
                to: customerEmail,
                customerName,
                contractNumber: contract.contractNumber,
                pdfBuffer: buffer
            });

            // 2. Send an optional internal ANS alert.
            // ANS failure must not turn a successful email into a failure.
            try {
                await sendAlert(
                    `Rental confirmation sent - ${contract.contractNumber}`,
                    `A rental confirmation email was accepted by Brevo for contract ${contract.contractNumber}.`,
                    "INFO",
                    {
                        contractNumber: String(contract.contractNumber)
                    }
                );
            } catch (error) {
                console.warn(
                    "ANS alert skipped:",
                    error.message
                );
            }

            return {
                success: true,
                message:
                    "Rental confirmation email was accepted by Brevo."
            };
        } catch (error) {
            console.error(
                "Rental confirmation failed:",
                error.message
            );

            return {
                success: false,
                message:
                    "Could not send the rental confirmation. Check the application logs."
            };
        }
    });

    // CREATE RENTAL CONTRACT
    // Customer ID is derived from the selected proposal.

    this.on("createRentalContract", async (req) => {
        const {
            proposal_ID,
            contractNumber,
            contractDate,
            startDate,
            endDate,
            totalRentalAmount
        } = req.data;

        if (!proposal_ID) {
            return req.error(400, "Proposal ID is required.");
        }

        const proposal = await SELECT.one
            .from(Proposals)
            .columns("ID", "customer_ID", "proposalStatus")
            .where({ ID: proposal_ID });

        if (!proposal) {
            return req.error(404, "Proposal not found.");
        }

        const customerId = proposal.customer_ID;

        if (!customerId) {
            return req.error(
                400,
                "The selected proposal has no customer assigned."
            );
        }

        if (!Customers) {
            return req.error(
                500,
                "Customer entity Master.db.Customers could not be found."
            );
        }

        const customer = await SELECT.one
            .from(Customers)
            .columns("ID")
            .where({ ID: customerId });

        if (!customer) {
            return req.error(
                400,
                "The customer assigned to this proposal does not exist."
            );
        }

        if (!String(contractNumber || "").trim()) {
            return req.error(400, "Contract number is required.");
        }

        const normalizedContractNumber =
            String(contractNumber).trim().toUpperCase();

        const existingContract = await SELECT.one
            .from(RentalContracts)
            .columns("ID")
            .where({ contractNumber: normalizedContractNumber });

        if (existingContract) {
            return req.error(
                409,
                `Contract number ${normalizedContractNumber} already exists.`
            );
        }

        if (!contractDate) {
            return req.error(400, "Contract date is required.");
        }

        if (!startDate || !endDate) {
            return req.error(
                400,
                "Rental start date and end date are required."
            );
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime())
        ) {
            return req.error(400, "Invalid rental dates.");
        }

        if (start > end) {
            return req.error(
                400,
                "Rental start date cannot be after the end date."
            );
        }

        if (
            totalRentalAmount === undefined ||
            totalRentalAmount === null ||
            String(totalRentalAmount).trim() === "" ||
            !Number.isFinite(Number(totalRentalAmount)) ||
            Number(totalRentalAmount) < 0
        ) {
            return req.error(
                400,
                "A valid total rental amount is required."
            );
        }

        const contractId = cds.utils.uuid();

        try {
            await INSERT.into(RentalContracts).entries({
                ID: contractId,
                proposal_ID: proposal.ID,
                customer_ID: customerId,
                contractNumber: normalizedContractNumber,
                contractDate,
                startDate,
                endDate,
                totalRentalAmount: Number(totalRentalAmount),
                contractStatus: "Active"
            });
        } catch (error) {
            if (/unique|constraint|duplicate/i.test(error.message || "")) {
                return req.error(
                    409,
                    `Contract number ${normalizedContractNumber} already exists.`
                );
            }

            throw error;
        }

        return contractId;
    });

    // get active rentals

    this.on("getActiveRentals", async () => {
        return SELECT.from(RentalContracts).where({
            contractStatus: "Active"
        });
    });

    // check rental period

    this.on("checkRentalPeriod", async (req) => {
        const { contract_ID, startDate, endDate } = req.data;

        if (!contract_ID) {
            return req.error(400, "Contract ID is required.");
        }

        if (!startDate || !endDate) {
            return req.error(
                400,
                "Rental start date and end date are required."
            );
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime())
        ) {
            return req.error(400, "Invalid rental dates.");
        }

        if (start > end) {
            return req.error(
                400,
                "Start date cannot be after the end date."
            );
        }

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: contract_ID });

        if (!contract) {
            return req.error(404, "Rental contract not found.");
        }

        if (normalizeStatus(contract.contractStatus) !== "ACTIVE") {
            return req.error(400, "Rental contract is not active.");
        }

        const activeContracts = await SELECT
            .from(RentalContracts)
            .where({ contractStatus: "Active" });

        for (const rental of activeContracts) {
            if (rental.ID === contract_ID) {
                continue;
            }

            if (!rental.startDate || !rental.endDate) {
                continue;
            }

            const existingStart = new Date(rental.startDate);
            const existingEnd = new Date(rental.endDate);

            if (start <= existingEnd && end >= existingStart) {
                return req.error(
                    400,
                    "The rental period overlaps with another active rental."
                );
            }
        }

        return "Rental period is available.";
    });

    // COMPLETE RENTAL CONTRACT
    // Releases allocated equipment and completes contract.

    this.on("completeRentalContract", async (req) => {
        const { contract_ID } = req.data;

        console.log(
            "completeRentalContract called:",
            contract_ID
        );

        if (!contract_ID) {
            return req.reject(400, "Contract ID is required.");
        }

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({ ID: contract_ID });

        if (!contract) {
            return req.reject(404, "Rental contract not found.");
        }

        if (normalizeStatus(contract.contractStatus) !== "ACTIVE") {
            return req.reject(400, "Rental contract is not active.");
        }

        const allocations = await SELECT
            .from(RentalAllocations)
            .where({ rentalContract_ID: contract_ID });

        if (!allocations || !allocations.length) {
            return req.reject(
                400,
                "No equipment is allocated to this rental contract."
            );
        }

        // 1. Release equipment.
        for (const allocation of allocations) {
            if (!allocation.equipment_ID) {
                continue;
            }

            await UPDATE(Rental_Physical_Equipment)
                .set({ status: "AVAILABLE" })
                .where({ ID: allocation.equipment_ID });

            await UPDATE(RentalAllocations)
                .set({ allocationStatus: "Released" })
                .where({ ID: allocation.ID });
        }

        // 2. Complete the contract.
        await UPDATE(RentalContracts)
            .set({ contractStatus: "Completed" })
            .where({ ID: contract_ID });

        // 3. Send an internal ANS alert.
        try {
            const alertSent = await sendAlert(
                `Rental contract completed - ${contract.contractNumber}`,
                `Rental contract ${contract.contractNumber} has been completed and its allocated equipment has been released.`,
                "INFO",
                {
                    contractNumber: String(contract.contractNumber)
                }
            );

            if (!alertSent) {
                console.warn(
                    "ANS alert was not accepted for completed contract:",
                    contract.contractNumber
                );
            }
        } catch (error) {
            console.error(
                "ANS alert failed (contract already completed):",
                error.message
            );
        }

        return "Rental contract completed and equipment released successfully.";
    });

    // get rental history

    this.on("getRentalHistory", async () => {
        return SELECT.from(RentalContracts).where({
            contractStatus: {
                in: ["Completed", "Cancelled"]
            }
        });
    });
});