
const cds = require("@sap/cds");

// BREVO EMAIL HELPER
// Sends the customer an email with the PDF attachment.

async function sendBrevoEmail({ to, customerName, contractNumber, pdfBuffer }) {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;

    if (!apiKey || !senderEmail) {
        throw new Error(
            "Brevo configuration is missing. Check BREVO_API_KEY and BREVO_SENDER_EMAIL."
        );
    }

    const subject = `Rental confirmation - ${contractNumber}`;

    const emailBody = [
        `Dear ${customerName},`,
        "",
        `Your rental contract ${contractNumber} has been confirmed.`,
        "Please find the rental contract PDF attached.",
        "",
        "Thank you.",
        "GMMCO Team"
    ].join("\n");

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            accept: "application/json",
            "api-key": apiKey,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            sender: {
                email: senderEmail,
                name: "GMMCO Rental System"
            },
            to: [
                {
                    email: to,
                    name: customerName
                }
            ],
            subject,
            textContent: emailBody,
            attachment: [
                {
                    name: `Rental-${contractNumber}.pdf`,
                    content: pdfBuffer.toString("base64")
                }
            ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();

        console.error(
            "Brevo email request failed:",
            response.status,
            errorText.slice(0, 1000)
        );

        throw new Error(
            `Brevo email request failed with status ${response.status}.`
        );
    }

    const result = await response.json();

    console.log("Brevo accepted the rental confirmation email.");

    return result;
}

// SAP ALERT NOTIFICATION SERVICE
// Used for internal alerts only.

// async function sendAlert(subject, body, severity = "INFO", tags = {}) {
//     try {
//         let credentials = {};

//         if (process.env.VCAP_SERVICES) {
//             const vcap = JSON.parse(process.env.VCAP_SERVICES);

//             for (const services of Object.values(vcap)) {
//                 const ansService = services.find(
//                     (service) =>
//                         service.name === "gmmco-alert-instance" ||
//                         service.label === "alert-notification"
//                 );

//                 if (ansService) {
//                     credentials = ansService.credentials || {};
//                     break;
//                 }
//             }
//         }

//         const clientId =
//             credentials.client_id || process.env.ANS_CLIENT_ID;
//         const clientSecret =
//             credentials.client_secret || process.env.ANS_CLIENT_SECRET;
//         const tokenUrl =
//             credentials.oauth_url || process.env.ANS_TOKEN_URL;
//         const apiUrl =
//             credentials.url || process.env.ANS_API_URL;

//         if (!clientId || !clientSecret || !tokenUrl || !apiUrl) {
//             console.error(
//                 "ANS configuration is incomplete. Check the service binding."
//             );
//             return false;
//         }

//         const basic = Buffer.from(
//             `${clientId}:${clientSecret}`
//         ).toString("base64");

//         const tokenResponse = await fetch(tokenUrl, {
//             method: "POST",
//             headers: {
//                 Authorization: `Basic ${basic}`,
//                 "Content-Type": "application/x-www-form-urlencoded"
//             },
//             body: "grant_type=client_credentials"
//         });

//         if (!tokenResponse.ok) {
//             console.error(
//                 "ANS token request failed:",
//                 tokenResponse.status,
//                 (await tokenResponse.text()).slice(0, 500)
//             );
//             return false;
//         }

//         const tokenData = await tokenResponse.json();

//         if (!tokenData.access_token) {
//             console.error("ANS did not return an access token.");
//             return false;
//         }

//         const safeTags = {};

//         for (const [key, value] of Object.entries(tags || {})) {
//             safeTags[key] = String(value ?? "");
//         }

//         const eventUrl =
//             `${apiUrl.replace(/\/+$/, "")}/cf/producer/v1/resource-events`;

//         const eventResponse = await fetch(eventUrl, {
//             method: "POST",
//             headers: {
//                 Authorization: `Bearer ${tokenData.access_token}`,
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({
//                 eventType: "RentalMail",
//                 resource: {
//                     resourceName: "rental-service",
//                     resourceType: "service"
//                 },
//                 severity,
//                 category: "NOTIFICATION",
//                 subject,
//                 body,
//                 tags: safeTags
//             })
//         });

//         if (!eventResponse.ok) {
//             console.error(
//                 "ANS event request failed:",
//                 eventResponse.status,
//                 (await eventResponse.text()).slice(0, 500)
//             );
//             return false;
//         }

//         console.log("ANS event accepted:", subject);
//         return true;
//     } catch (error) {
//         console.error("ANS notification failed:", error.message);
//         return false;
//     }
// }



// CAP SERVICE HANDLERS

module.exports = cds.service.impl(async function () {
    // const { SELECT, INSERT, UPDATE } = cds.ql;

    // const conn = await cds.connect.to('ANS-Producer');
    // console.log("Conn : ", conn);
    

    const {
        Proposals,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;

    const masterEntities = cds.entities("Master.db") || {};
    const Customers = masterEntities.Customers;

    // BUILD RENTAL CONTRACT PDF

    // async function buildRentalPdf(contractId) {
    //     console.log("Testing");
        
    //     if (!contractId) {
    //         throw new Error("Rental contract ID is required.");
    //     }

    //     const contract = await SELECT.one
    //         .from(RentalContracts)
    //         .where({ ID: contractId });

    //         console.log("Contract : ", contract);
            

    //     if (!contract) {
    //         throw new Error("Rental contract not found.");
    //     }

    //     if (!contract.customer_ID) {
    //         throw new Error(
    //             "The rental contract does not have a customer assigned."
    //         );
    //     }

    //     if (!Customers) {
    //         throw new Error(
    //             "Customer entity Master.db.Customers could not be found."
    //         );
    //     }

    //     const customer = await SELECT.one
    //         .from(Customers)
    //         .where({ ID: contract.customer_ID });

    //         console.log("Customer : ", customer);
            

    //     if (!customer) {
    //         throw new Error(
    //             "Customer assigned to the contract was not found."
    //         );
    //     }

    //     const allocations = await SELECT
    //         .from(RentalAllocations)
    //         .where({ rentalContract_ID: contractId });

    //         console.log("Allocations : ", allocations);
            

    //     const equipmentIds = allocations
    //         .map((allocation) => allocation.equipment_ID)
    //         .filter(Boolean);

    //         console.log("Equipment Id : ", equipmentIds);
            

    //     const equipment = equipmentIds.length
    //         ? await SELECT.from(Rental_Physical_Equipment).where({
    //             ID: { in: equipmentIds }
    //         })
    //         : [];

    //     const equipmentRows = equipment
    //         .map(
    //             (item) => `
    //                 <tr>
    //                     <td>${esc(item.equipment_Code)}</td>
    //                     <td>${esc(item.equipment_Name)}</td>
    //                     <td>${esc(item.serial_Number)}</td>
    //                     <td>${esc(item.status)}</td>
    //                 </tr>
    //             `
    //         )
    //         .join("");

    //     const html = `
    //         <!DOCTYPE html>
    //         <html>
    //         <head>
    //             <meta charset="UTF-8">
    //             <title>Rental Contract</title>
    //             <style>
    //                 body {
    //                     font-family: Arial, sans-serif;
    //                     padding: 30px;
    //                     color: #222;
    //                 }
    //                 table {
    //                     border-collapse: collapse;
    //                     width: 100%;
    //                     margin-top: 12px;
    //                 }
    //                 th, td {
    //                     border: 1px solid #888;
    //                     padding: 8px;
    //                     text-align: left;
    //                 }
    //                 th {
    //                     background: #f2f2f2;
    //                 }
    //             </style>
    //         </head>
    //         <body>
    //             <h2>Rental Contract Confirmation</h2>

    //             <p><strong>Contract Number:</strong>
    //                 ${esc(contract.contractNumber)}</p>

    //             <p><strong>Customer:</strong>
    //                 ${esc(customer.companyName)}</p>

    //             <p><strong>Customer Code:</strong>
    //                 ${esc(customer.customerCode)}</p>

    //             <p><strong>Contact Person:</strong>
    //                 ${esc(customer.contactPerson)}</p>

    //             <p><strong>Contract Date:</strong>
    //                 ${esc(contract.contractDate)}</p>

    //             <p><strong>Rental Period:</strong>
    //                 ${esc(contract.startDate)} to ${esc(contract.endDate)}</p>

    //             <p><strong>Total Rental Amount:</strong>
    //                 ${esc(contract.totalRentalAmount)}</p>

    //             <h3>Allocated Equipment</h3>

    //             <table>
    //                 <thead>
    //                     <tr>
    //                         <th>Equipment Code</th>
    //                         <th>Equipment Name</th>
    //                         <th>Serial Number</th>
    //                         <th>Status</th>
    //                     </tr>
    //                 </thead>
    //                 <tbody>
    //                     ${
    //                         equipmentRows ||
    //                         '<tr><td colspan="4">No equipment allocated</td></tr>'
    //                     }
    //                 </tbody>
    //             </table>
    //         </body>
    //         </html>
    //     `;

    //     const pdfUrl = process.env.PDFSHIFT_URL;
    //     const pdfApiKey = process.env.PDFSHIFT_API_KEY;

    //     if (!pdfUrl || !pdfApiKey) {
    //         throw new Error(
    //             "PDFShift configuration is missing. Check PDFSHIFT_URL and PDFSHIFT_API_KEY."
    //         );
    //     }

    //     const pdfResponse = await fetch(
    //         `${pdfUrl.replace(/\/+$/, "")}/convert/pdf`,
    //         {
    //             method: "POST",
    //             headers: {
    //                 "X-API-Key": pdfApiKey,
    //                 "Content-Type": "application/json"
    //             },
    //             body: JSON.stringify({
    //                 source: html,
    //                 sandbox: false
    //             })
    //         }
    //     );

    //     if (!pdfResponse.ok) {
    //         const errorText = await pdfResponse.text();

    //         console.error(
    //             "PDFShift request failed:",
    //             pdfResponse.status,
    //             errorText.slice(0, 1000)
    //         );

    //         throw new Error(
    //             `PDFShift PDF generation failed with status ${pdfResponse.status}.`
    //         );
    //     }

    //     const buffer = Buffer.from(
    //         await pdfResponse.arrayBuffer()
    //     );

    //     if (
    //         buffer.length < 5 ||
    //         buffer.subarray(0, 5).toString() !== "%PDF-"
    //     ) {
    //         throw new Error(
    //             "PDFShift did not return a valid PDF file."
    //         );
    //     }

    //     return { contract, customer, buffer };
    // }

    // =====================================================
    // GENERATE RENTAL PDF
    // =====================================================

    // this.on("generateRentalPdf", async (req) => {
    //     const { rentalContract_ID } = req.data;

    //     if (!rentalContract_ID) {
    //         return req.error(400, "Rental contract ID is required.");
    //     }

    //     try {
    //         const { buffer } = await buildRentalPdf(rentalContract_ID);
    //         console.log("Buffer : ", buffer);
            
    //         return buffer.toString("base64");
            
    //     } catch (error) {
    //         console.error("PDF generation failed:", error.message);
    //         return req.error(502, "Rental contract PDF generation failed.");
    //     }


    // });

    // function esc(value) {
    //     if (value === null || value === undefined) {
    //         return "";
    //     }

    //     return String(value)
    //         .replace(/&/g, "&amp;")
    //         .replace(/</g, "&lt;")
    //         .replace(/>/g, "&gt;")
    //         .replace(/"/g, "&quot;")
    //         .replace(/'/g, "&#39;");
    // };

    

    // =====================================================
    // SEND RENTAL CONFIRMATION
    // Sends one email with the rental contract PDF attached.
    // Call this after all equipment allocations succeed.
    // =====================================================

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

    // =====================================================
    // CREATE RENTAL CONTRACT
    // Customer ID is derived from the selected proposal.
    // =====================================================

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

        // if (normalizeStatus(proposal.proposalStatus) !== "APPROVED") {
        //     return req.error(
        //         400,
        //         "A rental contract can be created only for an approved proposal."
        //     );
        // }

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

    // =====================================================
    // GET ACTIVE RENTALS
    // =====================================================

    this.on("getActiveRentals", async () => {
        return SELECT.from(RentalContracts).where({
            contractStatus: "Active"
        });
    });

    // =====================================================
    // CHECK RENTAL PERIOD
    // =====================================================

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

    // =====================================================
    // COMPLETE RENTAL CONTRACT
    // Releases allocated equipment and completes contract.
    // =====================================================

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

    // =====================================================
    // GET RENTAL HISTORY
    // =====================================================

    this.on("getRentalHistory", async () => {
        return SELECT.from(RentalContracts).where({
            contractStatus: {
                in: ["Completed", "Cancelled"]
            }
        });
    });
});