module.exports = cds.service.impl(async function() {

    const {Proposals, ProposalItems, ManagerApprovals} = this.entities;

    // this.before('approve', async (req, res) => {
    //     const {ID} = req.data;
    // })


    this.on('availability', async (req, res) => {
        const {ID} = req.data;

        const proposalData = await SELECT.from(Proposals).where({ID : ID});
        console.log("ProposalData :", proposalData);

        const proposalItemData = await SELECT.from(ProposalItems).where({proposals_ID : ID});
        console.log("Proposal Items : ", proposalItemData);
        
        
        res = [];

        for(let data of proposalItemData){
            //console.log("Product ID  : ", data.product_ID); 

            quantity = 0;
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

    })

    this.on('approve', async (req, res) => {

        const {ID, decision, comments, approvedAmount} = req.data;

        const result = await this.send({
            event : 'availability',
            data : {
                ID: ID
            }
        });
        console.log("Result : ", result);

        avail = true
        for(let res of result){
            if(res.Equipment_Availability !== "Available"){
                avail = false;
                break;
            }
        }

        console.log("Avail : ", avail);
        
        if(avail){
            
            const ManagerData = await INSERT.into(ManagerApprovals).entries({
                reviewDate : new Date(),
                decision : decision,
                comments : comments,
                approvedAmount : approvedAmount,
                proposal_ID : ID
            })
            
            if(ManagerData) {
                const statusApprove = await UPDATE(Proposals).set({proposalStatus : 'Approved'}).where({ID : ID});
            }
        } else {
            return "No Required stock"
        }

        return statusApprove;

    });
    

    this.on('reject', async (req,res) => {
        
        const {ID} = req.data;

        const result = await this.send({
            event : 'availability',
            data : {ID : ID}
        })
        
        console.log("Result : ", result);

        avail = false;
        

    })

})




