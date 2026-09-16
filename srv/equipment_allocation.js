const cds = require ('@sap/cds');
module.exports=cds.service.impl(async function () {
    const {Proposals, ProposalItems, ManagerApprovals} = this.entities;

   this.on("allocateEquipment",async(req)=>{
    // get input
    const {proposalID, equipmentID} = req.data;
    
    console.log("Proposal ID:",proposalID);
    console.log("Equipment ID:",equipmentID);
   })
})