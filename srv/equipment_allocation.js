const cds = require('@sap/cds');
module.exports = cds.service.impl(function () {

    const {
        Proposals,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;


    this.on('allocationEquipment', async (req) => {

        const {
            proposal_ID,
            customer_ID,
            equipment_ID,
            quantity,
            startDate,
            endDate
        } = req.data;


        // 1. Check the proposal
        const proposal = await SELECT.one
            .from(Proposals)
            .where({
                ID: proposal_ID
            });

        if (!proposal) {
            return req.error(404, 'Proposal not found');
        }


        // 2. Check that the proposal is approved
        if (proposal.proposalStatus !== 'Approved') {
            return req.error(400, 'Proposal is not approved');
        }


        // 3. Find the equipment
        const equipment = await SELECT.one
            .from(Rental_Physical_Equipment)
            .where({
                ID: equipment_ID
            });

        if (!equipment) {
            return req.error(404, 'Equipment not found');
        }


        // 4. Check equipment availability
        if (equipment.status !== 'AVAILABLE') {
            return req.error(400, 'Equipment is not available');
        }


        // 5. Store allocation details
        await INSERT.into(RentalAllocations).entries({
            proposal_ID: proposal_ID,
            customer_ID: customer_ID,
            equipment_ID: equipment_ID,
            quantity: quantity,
            startDate: startDate,
            endDate: endDate
        });


        // 6. Update equipment status
        await UPDATE(Rental_Physical_Equipment)
            .set({
                status: 'AT_CUSTOMER'
            })
            .where({
                ID: equipment_ID
            });


        return 'Equipment allocated successfully';
    });

    //Show already allocated equipment history
    this.on('getAllocationHistory', async (req) => {

        const allocations = await SELECT
            .from(RentalAllocations);

        if (!allocations || allocations.length === 0) {
            return [];
        }

        return allocations;
    });

});   