module.exports = cds.service.impl(async function() {

    const {Proposals, ProposalItems, ManagerApprovals} = this.entities;

    // this.before('approve', async (req, res) => {
    //     const {ID} = req.data;
    // })

    //console.log(Object.keys(cds.services));
    //const masterData = await cds.connect.to('proposal.srv.Masterapi');


    async function equipmentAvailability(ID, res = []){

        const proposalData = await SELECT.from(Proposals).where({ID : ID});
        console.log("ProposalData :", proposalData);

        const proposalItemData = await SELECT.from(ProposalItems).where({proposals_ID : ID});
        console.log("Proposal Items : ", proposalItemData);
        

        for(let data of proposalItemData){
            //console.log("Product ID  : ", data.product_ID); 

            quantity = 0;
            console.log("Datas Testing : ", data);
            
            const product_Data = await SELECT.from('Rental_Physical_Equipment').columns('ID','equipment_Name', 'status', 'product_ref_ID').where({product_ref_ID : data.product_ID});
            console.log("Product Status 1: ", product_Data);

                for (let prodData of product_Data) {
                    
                    if(prodData.status === "AT_CUSTOMER") {
                        const rentalAllocations = await SELECT.from('RentalAllocations').where({equipment_ID:prodData.ID});
                        console.log("Rental Allocations : ", rentalAllocations);
                        
                        if(rentalAllocations.length >= 1){   
                            console.log("Resquested Start Date : ", data.startDate);
                            console.log("Requested End Date : ", data.endDate);

                            console.log("Rental Start Date : ", rentalAllocations[0].allocationStartDate);
                            console.log("Rental End Date : ", rentalAllocations[0].allocationEndDate);
                            

                            console.log(`Overlap 1 : ${data.startDate} < ${rentalAllocations[0].allocationEndDate}`, ((data.startDate >= rentalAllocations[0].allocationStartDate) && (data.startDate <= rentalAllocations[0].allocationEndDate)));
                            console.log(`Overlap 2 : ${data.endDate} < ${rentalAllocations[0].allocationStartDate}`, ((data.endDate >= rentalAllocations[0].allocationStartDate) && (data.endDate <= rentalAllocations[0].allocationEndDate)));
                            
                            
                            const overlap = ((data.startDate >= rentalAllocations[0].allocationStartDate) && (data.startDate <= rentalAllocations[0].allocationEndDate)) || 
                            ((data.endDate >= rentalAllocations[0].allocationStartDate) && (data.endDate <= rentalAllocations[0].allocationEndDate));

                            console.log("Overlap : ", overlap);
                            
                            if(!overlap) {
                                quantity++;
                            }

                        }
                         
                    } else if(prodData.status === "AVAILABLE"){
                            quantity++
                    }
                }
                console.log("quantity : ", quantity);
                
            const productName = await SELECT.one.from('Product').columns('product_Name').where({ID : data.product_ID});
            console.log("Prudct_Name : ....................", productName);
            
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

           //console.log("Res : ", res);
            
        return res;

    }

    this.after('READ', Proposals, async (data, res) => {
        //const data = equipmentAvailability(ID);
        //console.log(data);


        //The read handler waits until all the proposal data is finshes it works/promises. and then availabilitystatus is added to the response and then sends the result to the browser. 
        await Promise.all(
            data.map(async (responseData) => {
                console.log("Response Data : ", responseData);
                res = [];
                avail = [];
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
               
            if(responseData.proposalStatus === "Submitted" || responseData.proposalStatus === "Under Review" ){    
                responseData.availabilityStatus =  await avail.every((data) => data === true) ? "Available" : "Not Available";
            }

            avail.length = 0; 
    
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

    })

   

})




