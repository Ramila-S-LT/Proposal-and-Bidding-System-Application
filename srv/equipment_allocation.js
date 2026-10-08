const cds = require("@sap/cds");

module.exports = cds.service.impl(function () {

    const {
        Proposals,
        ProposalItems,
        RentalContracts,
        RentalAllocations,
        Rental_Physical_Equipment
    } = this.entities;

    // get approved proposal

    this.on("getApprovedProposals", async (req) => {

        const aProposals =
            await SELECT
                .from(Proposals)
                .where({
                    proposalStatus: "Approved"
                });

        return aProposals;
    });


    // read proposals

    this.on("READ", Proposals, async (req) => { 

        const aProposals =
            await SELECT
                .from(Proposals)
                .where({
                    proposalStatus: "Approved"
                });

        return aProposals;
    });


    // get proposal items

    this.on("getProposalItems", async (req) => {

        const {
            proposal_ID
        } = req.data;


        if (!proposal_ID) {

            return req.error(
                400,
                "Proposal ID is required"
            );
        }


        const oProposal =
            await SELECT.one
                .from(Proposals)
                .where({
                    ID: proposal_ID
                });


        if (!oProposal) {

            return req.error(
                404,
                "Proposal not found"
            );
        }


        const aItems =
            await SELECT
                .from(ProposalItems)
                .where({
                    proposals_ID: proposal_ID
                });


        return aItems;
    });


    // get available equipment
    this.on("getAvailableEquipment", async (req) => {

    const { Rental_Physical_Equipment } = this.entities;

    try {

        const aEquipment =
            await SELECT.from(Rental_Physical_Equipment);

        const aAvailableEquipment =
            aEquipment.filter(function (oEquipment) {

                return String(
                    oEquipment.status || ""
                ).toUpperCase() === "AVAILABLE";

            });

        console.log(
            "Available equipment:",
            aAvailableEquipment
        );

        return aAvailableEquipment;

    } catch (error) {

        console.error(
            "Error loading available equipment:",
            error
        );

        req.error(
            500,
            "Unable to load available equipment"
        );
    }
});


    // get equipment history

    this.on("getEquipmentHistory", async (req) => {

        const {
            equipment_ID
        } = req.data;


        if (!equipment_ID) {

            return req.error(
                400,
                "Equipment ID is required"
            );
        }


        const oEquipment =
            await SELECT.one
                .from(Rental_Physical_Equipment)
                .where({
                    ID: equipment_ID
                });


        if (!oEquipment) {

            return req.error(
                404,
                "Equipment not found"
            );
        }


        const aHistory =
            await SELECT
                .from(RentalAllocations)
                .where({
                    equipment_ID: equipment_ID
                });


        return aHistory;
    });


    // create rental contract

this.on("createRentalContract", async (req) => {

    const {
        proposal_ID,
        contractNumber,
        contractDate,
        startDate,
        endDate,
        totalRentalAmount
    } = req.data;


    // 1. Proposal ID validation

    if (!proposal_ID) {

        return req.error(
            400,
            "Proposal ID is required"
        );
    }


    // 2. Contract number validation

    if (
        !contractNumber ||
        !String(contractNumber).trim()
    ) {

        return req.error(
            400,
            "Contract number is required"
        );
    }


    // 3. Contract date validation

    if (!contractDate) {

        return req.error(
            400,
            "Contract date is required"
        );
    }


    // 4. Start date validation

    if (!startDate) {

        return req.error(
            400,
            "Rental start date is required"
        );
    }


    // 5. End date validation

    if (!endDate) {

        return req.error(
            400,
            "Rental end date is required"
        );
    }


    // 6. Total amount validation

    if (
        totalRentalAmount === undefined ||
        totalRentalAmount === null ||
        isNaN(Number(totalRentalAmount))
    ) {

        return req.error(
            400,
            "Valid total rental amount is required"
        );
    }


    // 7. Date validation

    const oStartDate =
        new Date(startDate);

    const oEndDate =
        new Date(endDate);


    if (
        isNaN(oStartDate.getTime()) ||
        isNaN(oEndDate.getTime())
    ) {

        return req.error(
            400,
            "Invalid rental dates"
        );
    }


    if (oStartDate > oEndDate) {

        return req.error(
            400,
            "Rental start date cannot be after end date"
        );
    }


    // 8. Get Proposal

    const oProposal =
        await SELECT.one
            .from(Proposals)
            .where({
                ID: proposal_ID
            });


    if (!oProposal) {

        return req.error(
            404,
            "Proposal not found"
        );
    }


    // 9. Proposal must be approved

    if (
        normalizeStatus(
            oProposal.proposalStatus
        ) !== "APPROVED"
    ) {

        return req.error(
            400,
            "Rental contract can be created only for approved proposals"
        );
    }


    // 10. Get Customer ID from Proposal

    if (!oProposal.customer_ID) {

        return req.error(
            400,
            "Customer is not assigned to this proposal"
        );
    }


    // 11. Check duplicate contract number

    const sContractNumber =
        String(
            contractNumber
        ).trim();


    const oExistingContract =
        await SELECT.one
            .from(RentalContracts)
            .where({
                contractNumber:
                    sContractNumber
            });


    if (oExistingContract) {

        return req.error(
            409,
            `Rental contract number ${sContractNumber} already exists`
        );
    }


    // 12. Check whether proposal already has a contract

    const oProposalContract =
        await SELECT.one
            .from(RentalContracts)
            .where({
                proposal_ID:
                    proposal_ID
            });


    if (oProposalContract) {

        return req.error(
            400,
            "Rental contract already exists for this proposal"
        );
    }


    // 13. Create Rental Contract

    const sRentalContractId =
        cds.utils.uuid();


    await INSERT
        .into(RentalContracts)
        .entries({

            ID:
                sRentalContractId,

            proposal_ID:
                proposal_ID,

            // IMPORTANT:
            // Customer comes from Proposal
            customer_ID:
                oProposal.customer_ID,

            contractNumber:
                sContractNumber,

            contractDate:
                contractDate,

            startDate:
                startDate,

            endDate:
                endDate,

            totalRentalAmount:
                Number(
                    totalRentalAmount
                ),

            contractStatus:
                "Active"
        });


    return sRentalContractId;
});


    // allocate equipment

    this.on("allocationEquipment", async (req) => {

    const {
        RentalAllocations,
        Rental_Physical_Equipment,
        RentalContracts
    } = this.entities;

    try {

        const {
            proposal_ID,
            equipment_ID,
            startDate,
            endDate,
            rentalContract_ID
        } = req.data;

        // console.log("========== ALLOCATION EQUIPMENT ==========");
        // console.log("Proposal ID:", proposal_ID);
        // console.log("Equipment ID:", equipment_ID);
        // console.log("Rental Contract ID:", rentalContract_ID);

        if (!proposal_ID) {
            return req.error(400, "Proposal ID is required");
        }

        if (!equipment_ID) {
            return req.error(400, "Equipment ID is required");
        }

        if (!rentalContract_ID) {
            return req.error(400, "Rental Contract ID is required");
        }

        // Check rental contract
        const aContracts = await SELECT.from(
            RentalContracts
        ).where({
            ID: rentalContract_ID
        });

        if (!aContracts || aContracts.length === 0) {
            return req.error(
                404,
                "Rental contract not found"
            );
        }

        // Check equipment
        const aEquipment = await SELECT.from(
            Rental_Physical_Equipment
        ).where({
            ID: equipment_ID
        });

        if (!aEquipment || aEquipment.length === 0) {
            return req.error(
                404,
                "Selected equipment not found"
            );
        }

        const oEquipment = aEquipment[0];

        console.log("Selected equipment:", oEquipment);

        // Equipment must be AVAILABLE
        const sStatus = String(
            oEquipment.status || ""
        ).toUpperCase();

        if (sStatus !== "AVAILABLE") {
            return req.error(
                400,
                "Selected equipment is not available"
            );
        }

        // Generate allocation number
        const sAllocationNumber =
            "ALLOC-" +
            Date.now();

        // Create rental allocation
        await INSERT.into(
            RentalAllocations
        ).entries({

            allocationNumber:sAllocationNumber,

            allocationDate:new Date(),

            allocationStartDate:startDate,

            allocationEndDate:endDate,

            allocationStatus:"Allocated",

            rentalContract_ID:rentalContract_ID,

            equipment_ID:equipment_ID

        });

        // Update equipment status
        await UPDATE(
            Rental_Physical_Equipment
        )
        .set({
            status: "AT_CUSTOMER"
        })
        .where({
            ID: equipment_ID
        });

        console.log(
            "Equipment allocated successfully:",
            equipment_ID
        );

        return "Equipment allocated successfully";

    } catch (error) {

        console.error(
            "ALLOCATION EQUIPMENT ERROR"
        );

        return req.error(
            500,
            error.message ||
            "Equipment allocation failed"
        );
    }

});


    // complete rental contract

    this.on("completeRentalContract", async (req) => {

        const {
            contract_ID
        } = req.data;


        if (!contract_ID) {

            return req.error(
                400,
                "Contract ID is required"
            );
        }


        const oContract =
            await SELECT.one
                .from(RentalContracts)
                .where({
                    ID:
                        contract_ID
                });


        if (!oContract) {

            return req.error(
                404,
                "Rental contract not found"
            );
        }


        if (
            normalizeStatus(
                oContract.contractStatus
            ) === "COMPLETED"
        ) {

            return req.error(
                400,
                "Rental contract is already completed"
            );
        }


        const aAllocations =
            await SELECT
                .from(RentalAllocations)
                .where({
                    rentalContract_ID:
                        contract_ID
                });


        if (
            !aAllocations ||
            aAllocations.length === 0
        ) {

            return req.error(
                400,
                "No equipment is allocated to this rental contract"
            );
        }


        for (
            const oAllocation of aAllocations
        ) {

            if (
                oAllocation.equipment_ID
            ) {

                await UPDATE(
                    Rental_Physical_Equipment
                ).set({status:"AVAILABLE"}).where({ID:oAllocation.equipment_ID});


                await UPDATE(RentalAllocations).set({allocationStatus:"Released"}).where({ID:oAllocation.ID});
            }
        }


        await UPDATE(
            RentalContracts
        )
            .set({
                contractStatus:
                    "Completed"
            })
            .where({
                ID:
                    contract_ID
            });


        console.log(
            "Rental contract completed:",
            oContract.contractNumber
        );


        return (
            "Rental contract completed and equipment released successfully"
        );
    });


    // send customer notification

    this.on(
        "sendCustomerNotification",
        async (req) => {

            const {
                customer_ID,
                message
            } = req.data;


            if (!customer_ID) {

                return req.error(
                    400,
                    "Customer ID is required"
                );
            }


            if (!message) {

                return req.error(
                    400,
                    "Notification message is required"
                );
            }

            return (
                "Customer notification sent successfully"
            );
        }
    );

});