const cds = require('@sap/cds');

module.exports = cds.service.impl(function () {

    const {
        Proposals,
        ProposalItems,
        Rental_Physical_Equipment,
        RentalContracts,
        RentalAllocations
    } = this.entities;


    this.on('READ', Proposals,async(req,res)=>{
        const proposal = await SELECT.from(Proposals).where({ proposalStatus: "Approved" });
        return proposal;
    })

//  GET APPROVED PROPOSALS

    this.on('getApprovedProposals', async (req) => {

        const proposals = await SELECT.from(Proposals)
            .where({
                proposalStatus: 'Approved'
            });

        return proposals;
    });


    // Get Proposal Items

    this.on('getProposalItems', async (req) => {

        const { proposal_ID } = req.data;

        if (!proposal_ID) {
            return req.error(400, 'Proposal ID is required');
        }

        const proposal = await SELECT.one
            .from(Proposals)
            .where({
                ID: proposal_ID
            });

        if (!proposal) {
            return req.error(404, 'Proposal not found');
        }

        const items = await SELECT.from(ProposalItems)
            .where({
                proposal_ID: proposal_ID
            });

        return items;
    });


    // Get Available Equipment

    this.on('getAvailableEquipment', async () => {

        const equipment = await SELECT.from(Rental_Physical_Equipment)
            .where({
                status: 'AVAILABLE'
            });

        return equipment;
    });


    // Available Equipment
    this.on('allocationEquipment', async (req) => {

        const {
            proposal_ID,
            customer_ID,
            equipment_ID,
            quantity,
            startDate,
            endDate,
            rentalContract_ID
        } = req.data;


        // Basic VAlidation

        if (!proposal_ID) {
            return req.error(400, 'Proposal ID is required');
        }

        if (!customer_ID) {
            return req.error(400, 'Customer ID is required');
        }

        if (!equipment_ID) {
            return req.error(400, 'Equipment ID is required');
        }

        if (!rentalContract_ID) {
            return req.error(400, 'Rental Contract ID is required');
        }

        if (!quantity || quantity <= 0) {
            return req.error(400, 'Quantity must be greater than zero');
        }

        if (!startDate) {
            return req.error(400, 'Start date is required');
        }

        if (!endDate) {
            return req.error(400, 'End date is required');
        }


    //  Check Proposal

        const proposal = await SELECT.one
            .from(Proposals)
            .where({
                ID: proposal_ID
            });

        if (!proposal) {
            return req.error(404, 'Proposal not found');
        }


        // Only approved proposal can be allocated

        if (proposal.proposalStatus !== 'Approved') {
            return req.error(
                400,
                'Only approved proposals can be allocated'
            );
        }


        // Check rental contract

        const contract = await SELECT.one
            .from(RentalContracts)
            .where({
                ID: rentalContract_ID
            });

        if (!contract) {
            return req.error(404, 'Rental contract not found');
        }


        // Check contract belongs to proposal

        if (contract.proposal_ID !== proposal_ID) {
            return req.error(
                400,
                'Rental contract does not belong to this proposal'
            );
        }


        // Check equipment 

        const equipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({
                ID: equipment_ID
            });

        if (!equipment) {
            return req.error(404, 'Equipment not found');
        }


        // Check equipment availability
        if (equipment.status !== 'AVAILABLE') {
            return req.error(
                400,
                'Selected equipment is not available'
            );
        }


        // Create allocation record

        await INSERT.into(RentalAllocations).entries({

            proposal_ID: proposal_ID,

            customer_ID: customer_ID,

            equipment_ID: equipment_ID,

            rentalContract_ID: rentalContract_ID,

            quantity: quantity,

            startDate: startDate,

            endDate: endDate,

            allocationStatus: 'ALLOCATED'
        });


        // Update equipment status

        await UPDATE(Rental_Physical_Equipment)
            .set({
                status: 'AT_CUSTOMER'
            })
            .where({
                ID: equipment_ID
            });


        // Notification placeholder

        console.log(
            `Notification: Equipment ${equipment.equipment_Code} allocated to customer ${customer_ID}`
        );


        return `Equipment ${equipment.equipment_Code} allocated successfully`;
    });


    // GET EQUIPMENT ALLOCATION HISTORY

    this.on('getEquipmentHistory', async (req) => {

        const { equipment_ID } = req.data;

        if (!equipment_ID) {
            return req.error(400, 'Equipment ID is required');
        }


        // Check equipment

        const equipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({
                ID: equipment_ID
            });

        if (!equipment) {
            return req.error(404, 'Equipment not found');
        }


        // Get Allocation History

        const history = await SELECT.from(RentalAllocations)
            .where({
                equipment_ID: equipment_ID
            });

        return history;
    });

});