const UPDATE = require("@sap/cds/lib/ql/UPDATE");
require('dotenv').config()
const ax = require('axios');
const https = require('https');

module.exports = cds.service.impl(async function() {

    const {Proposals, ProposalItems, ManagerApprovals, Customers} = this.entities;

    const conn = await cds.connect.to('ANS-Producer');
    console.log("Conn : ", conn);
    

    // this.before('approve', async (req, res) => {
    //     const {ID} = req.data;
    // })

    //console.log(Object.keys(cds.services));
    //const masterData = await cds.connect.to('proposal.srv.Masterapi');


    async function equipmentAvailability(ID, res = []){

        const proposalData = await SELECT.from(Proposals).where({ID : ID});
        // console.log("ProposalData :", proposalData);

        const proposalItemData = await SELECT.from(ProposalItems).where({proposals_ID : ID});
        // console.log("Proposal Items : ", proposalItemData);
        

        for(let data of proposalItemData){
            //console.log("Product ID  : ", data.product_ID); 

            quantity = 0;
            // console.log("Datas Testing : ", data);
            
            const product_Data = await SELECT.from('Rental_Physical_Equipment').columns('ID','equipment_Name', 'status', 'product_ref_ID').where({product_ref_ID : data.product_ID});
            // console.log("Product Status 1: ", product_Data);

                for (let prodData of product_Data) {
                    
                    if(prodData.status === "AT_CUSTOMER") {
                        const rentalAllocations = await SELECT.from('RentalAllocations').where({equipment_ID:prodData.ID});
                        console.log("Rental Allocations : ", rentalAllocations);
                        
                        if(rentalAllocations.length >= 1){   
                            // console.log("Resquested Start Date : ", data.startDate);
                            // console.log("Requested End Date : ", data.endDate);

                            // console.log("Rental Start Date : ", rentalAllocations[0].allocationStartDate);
                            // console.log("Rental End Date : ", rentalAllocations[0].allocationEndDate);
                            

                            // console.log(`Overlap 1 : ${data.startDate} < ${rentalAllocations[0].allocationEndDate}`, ((data.startDate >= rentalAllocations[0].allocationStartDate) && (data.startDate <= rentalAllocations[0].allocationEndDate)));
                            // console.log(`Overlap 2 : ${data.endDate} < ${rentalAllocations[0].allocationStartDate}`, ((data.endDate >= rentalAllocations[0].allocationStartDate) && (data.endDate <= rentalAllocations[0].allocationEndDate)));
                            
                            
                            const overlap = ((data.startDate >= rentalAllocations[0].allocationStartDate) && (data.startDate <= rentalAllocations[0].allocationEndDate)) || 
                            ((data.endDate >= rentalAllocations[0].allocationStartDate) && (data.endDate <= rentalAllocations[0].allocationEndDate));

                            // console.log("Overlap : ", overlap);
                            
                            if(!overlap) {
                                quantity++;
                            }

                        }
                         
                    } else if(prodData.status === "AVAILABLE"){
                            quantity++
                    }
                }
                // console.log("quantity : ", quantity);
                
            const productName = await SELECT.one.from('Product').columns('product_Name').where({ID : data.product_ID});
            // console.log("Prudct_Name : ....................", productName);
            
                let Status = ""
               if(quantity >= data.quantity){
                    Status = "Available"
               } else {
                    Status = "Not Available"
               }
            
                if(product_Data){
                    res.push({
                        Product_Name : productName.product_Name,
                        Available_Quantity : quantity,
                        Requested_Quantity : data.quantity,
                        Equipment_Availability : Status
                    });
                }
            }

           console.log("Res : ", res);
            
        return res;

    }

    this.after('READ', Proposals, async (data, res) => {
        //const data = equipmentAvailability(ID);
        //console.log(data);

        console.log("Read Handler....");
        
        //The read handler waits until all the proposal data is finshes it works/promises. and then availabilitystatus is added to the response and then sends the result to the browser. 
        await Promise.all(
            data.map(async (responseData) => {
                console.log("Response Data : ", responseData);
                let res = [];
                let avail = [];
                const result =  await equipmentAvailability(responseData.ID, res);
                console.log("Results ::::::", result);

                for(let res of result){
                    if(res.Equipment_Availability !== "Available"){
                        avail.push(false);
                    } else {
                        avail.push(true);
                    }
                }

                console.log("AVAIL :", avail);
               
            // if(responseData.proposalStatus === "Under Review" || responseData.proposalStatus === "Pending"){    
                // responseData.availabilityStatus =  await avail.every((data) => data === true) ? "Available" : "Not Available";
            // }

                if(avail.includes(false)){
                    responseData.availabilityStatus = "Not Available"
                } else {
                    responseData.availabilityStatus = "Available"
                }

            // avail.length = 0; 
            console.log("After Inserts : ", avail);
            
    
            console.log("Final Data : ", responseData);
            
            }))
        
    })


    this.on('availabilityDetails', async (req, res) => {
        const {ID} = req.data;

        const dataRes = await equipmentAvailability(ID);
        console.log("Data Result : ", dataRes);

        return dataRes;
        
    })
    

    this.on('approve', async (req, res) => {

        const {ID, decision, comments, approvedAmount} = req.data;

        const ManagerData = await INSERT.into(ManagerApprovals).entries({
                reviewDate : new Date(),
                decision : decision,
                comments : comments,
                approvedAmount : approvedAmount,
                proposal_ID : ID
            })
            
            if(ManagerData) {
                const statusApprove = await UPDATE(Proposals).set({proposalStatus : 'Approved'}).where({ID : ID});
                const GetApprovedData = await SELECT.one.from(Proposals).columns(['*', {ref: ['customer'], expand: ['*']}]).where({ID : ID});
                console.log("Proposal Data : ", GetApprovedData);
                
                
                let token = await generateToken();
                await notify(GetApprovedData, token);

                return statusApprove;
            }

        // const result = await this.send({
        //     event : 'availability',
        //     data : {
        //         ID: ID
        //     }
        // });
        // console.log("Result : ", result);

        // avail = true
        // for(let res of result){
        //     if(res.Equipment_Availability !== "Available"){
        //         avail = false;
        //         break;
        //     }
        // }

        // console.log("Avail : ", avail);
        
        // if(avail){
            
            
    });

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
        
        // const res = await ax.post(
        //     "https://f6743c08trial.authentication.us10.hana.ondemand.com/oauth/token",
        //     "grant_type=client_credentials",
        //     {
        //         headers: {
        //             "Content-Type" : "application/x-www-form-urlencoded"
        //         },
        //         auth : {
        //             username : process.env.client_id,
        //             password : process.env.client_secret
        //         }
        //     }
        // );

        // console.log("Token : ", res.data.access_token);
        

        // return res.data.access_token;
    };

    async function notify(GetApprovedData, token) {
        console.log("Token inside notify : ", token);
        console.log("Get Approval Data : ", GetApprovedData);
        
        console.log("Url : ", process.env.url);

        await ax.post(
            'https://clm-sl-ans-live-ans-service-api.cfapps.us10.hana.ondemand.com/cf/producer/v1/resource-events',
            {
                eventType : "Approval_Notifications",
                severity : "INFO",
                subject : "Proposal Approved",
                body : "This proposal is approved",
                category : "NOTIFICATION",
                tags : {
                    PropNumber : GetApprovedData.proposalNumber,
                    customerName : GetApprovedData.customer.companyName
                },
                resource : {
                    resourceName : "GMMCOApplication",
                    resourceType : "Application",
                    resourceInstance : "1",
                    tags: {
                        application : "Proposal-Creation"
                    }
                }
            },
                {
                    headers: {
                        Authorization : `Bearer ${token}`,
                        "Content-Type" : "application/json"
                    },
                    httpsAgent: new https.Agent({rejectUnauthorized: false}),
                    proxy : false
                }
        );

        console.log("Sent Successfully");
        
    };

    this.on('rejectProposal', async (req, res) => {
        const {ID, decision, comments, approvedAmount} = req.data;

        const ManagerData = await INSERT.into(ManagerApprovals).entries({
                reviewDate : new Date(),
                decision : decision,
                comments : comments,
                approvedAmount : approvedAmount,
                proposal_ID : ID
            })
            
            if(ManagerData) {
                const statusApprove = await UPDATE(Proposals).set({proposalStatus : 'Rejected'}).where({ID : ID});
                
                return statusApprove;
            }

    })
    
    this.on('underReview', async (req, res) => {
        const {ID, decision, comments, approvedAmount} = req.data;

        const ManagerData = await INSERT.into(ManagerApprovals).entries({
                reviewDate : new Date(),
                decision : decision,
                comments : comments,
                approvedAmount : approvedAmount,
                proposal_ID : ID
            })
            
            if(ManagerData) {
                const statusApprove = await UPDATE(Proposals).set({proposalStatus : 'Under Review'}).where({ID : ID});
                
                return statusApprove;
            }

    });

    this.on('customerVerify', async(req, res) => {
        console.log("Testing...");
        
        const {ID} = req.data;

        const VerifyCusto = await UPDATE(Customers).set({status : 'Approved'}).where({ID : ID});
        console.log("VerifyCusto : ", VerifyCusto);

        if(VerifyCusto === 0) {
            req.error(404, "Customer not found")
            return;
        }

        const customer = await SELECT.one.from(Customers).where({ID :ID});
        console.log("customer ............ ", customer);
        

        if(!customer || !customer.customerEmail){
            req.error(400, "Customer email is missing");
            return;
        }

        const token = await generateToken();

        await notifyCustomerVerification(customer, token);

        return {
            success : true,
            message : `Customer Verified successfully. Notification event sent for ${customer.customerEmail}`
        }
    });



    async function notifyCustomerVerification(customer, token) {
        console.log("Token : ", token);
        
        console.log("Customer Verification notification");
        console.log("Customer ID : ", customer.ID);
        console.log("Customer Email : ", customer.customerEmail);

        await ax.post(
            'https://clm-sl-ans-live-ans-service-api.cfapps.us10.hana.ondemand.com/cf/producer/v1/resource-events',
            {
                eventType : "customer_Verified",
                severity : "INFO",
                subject: "Customer Verification Successful",
                body: `Dear ${customer.companyName},\n\nGreetings from GMMCO!\n\nWe are pleased to inform you that your company registration has been successfully verified and approved.\n\nRegistered Email: ${customer.customerEmail}\nVerification Status: Approved\n\nThank you for choosing GMMCO.\n\nBest regards,\nGMMCO Team`,
                category : "NOTIFICATION",
                tags : {
                    customerId : customer.ID,
                    customerName : customer.companyName,
                    customerEmail : customer.customerEmail
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

    this.on('customerReject', async(req, res) => {
        const {ID} = req.data;

        const RejectCusto = await UPDATE(Customers).set({status : 'Rejected'}).where({ID : ID});
        console.log("Reject Custo : ", RejectCusto);
        
    })

   
})




