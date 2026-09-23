namespace Master.db;
 
using { cuid, managed } from '@sap/cds/common';
 

//Master Data

entity Product : cuid {
    product_Type : String;  //identifies what type of product it is ...like Road roaler,JCB
    product_Code : String;  //unic busiess code used to identify the product
    product_Name : String;  //name of the product
    product_Group: String;  //Group similer products ....like construction equipments
    Category     : String;  //more specific classification
    Discription  : String;
    Model        : String;  //version or model of the machines
    Status       : String;
    basePrice    : Integer;
  
    rent_equipment_ref : Composition of many Rental_Physical_Equipment on rent_equipment_ref.product_ref = $self;
   // rental_pricing_ref : Association to one Rental_Equipment_Pricing on rental_pricing_ref.product_ref = $self;
    spare_junc : Association to  many Spare_Product on spare_junc.product_ref = $self;
    prod_attach_junc : Association to  many Prod_Attach on prod_attach_junc.product_ref = $self;
    prod_oper_junc : Association to  many Prod_Operator on prod_oper_junc.Prod_ref = $self;
 
}
 
 
entity Rental_Physical_Equipment : cuid {
    equipment_Code : String;
    equipment_Name : String;
    serial_Number : String;
    model : String;
    status : String;
    location : String;
 
    product_ref : Association to Product;
}
 
 
// entity Rental_Equipment_Pricing : cuid {
//     Daily_Rental_Rate   : Integer; //Rental price per day
//     Weekly_Rental_Rate  : Integer; //rental price per week
//     Monthly_Rental_Rate : Integer; //rental price per month
   
//     product_ref : Association to Product;
 
// }
 
 
entity Machine_Operator : cuid {
    operator_Code       : String;
    operator_Name       : String;
    phone_Number        : String;
    Email               : String;
    License_Expring_Date: Date;
    Experience_Year     : Integer;
    Location            : String;
    Status              : String;
 
    prod_oper_junc : Association to  many Prod_Operator on prod_oper_junc.Machine_ref = $self;
 
}
 
 
entity Spare_Parts : cuid {
    Part_Number         : String;
    part_Name           : String;
    Description         : String;
    Category            : String;
    available_Quantity  : Integer;
    Unit_price          : Integer;
 
    spare_junc : Association to  many Spare_Product on spare_junc.spare_ref = $self;
 
}
 
entity Attachment : cuid {
    attachment_Code : String;
    attachment_Name : String;
    attachment_Type : String;
    model : String;
    status : String;
    basePrice : Integer;
 
    Prod_attach_junc : Association to  many Prod_Attach on Prod_attach_junc.attachment_ref = $self;
    //attach_Price_ref : Composition of one Rental_Attachment_Pricing on attach_Price_ref.attachment_ref = $self;
 
}
 
 
// entity Rental_Attachment_Pricing : cuid {
 
//     Daily_Rental_Rate   : Decimal(15,2);
//     Weekly_Rental_Rate  : Decimal(15,2);
//     Monthly_Rental_Rate : Decimal(15,2);
//     Minimum_Rental_Days : Integer;
 
//     attachment_ref : Association to one Attachment;
//}
 
 
entity Prod_Attach {
    key product_ref : Association to Product;
    key attachment_ref : Association to Attachment;
}
 
entity Spare_Product {
    key spare_ref : Association to Spare_Parts;
    key product_ref : Association to Product;
}
 
entity Prod_Operator {
    key Prod_ref : Association to Product;
    key Machine_ref : Association to Machine_Operator;
}


//Transactional Data

entity Customers : cuid, managed {
 
    customerCode     : String;
    companyName      : String;
    companyType      : String enum {
                        Construction;
                        Mining
                    };
 
    contactPerson    : String;
    customerEmail    : String;
    phone            : String @assert.format : '^[6-9][0-9]{9}$';
 
    address          : String;
    city             : String;
    state            : String;
    country          : String;
 
    regDate          : Date default $now;
    status           : String default 'Pending';
    username         : String;
    password         : String;
 
    proposals        : Association to many Proposals
                       on proposals.customer = $self;
 
    rentalContracts  : Association to many RentalContracts
                       on rentalContracts.customer = $self;
}
 
 
entity Proposals : cuid, managed {
 
    proposalNumber   : String;
    proposalDate     : Date;
 
    proposalType     : String;
    // RENTAL, SALES

    proposalStatus   : String default 'Pending';
    // DRAFT, SUBMITTED, APPROVED, REJECTED
 
    totalAmount      : Decimal;
    
    negotiateAmount  : Decimal;
 
    customerRemarks  : String;
 
    submittedAt      : Timestamp;
 
    customer         : Association to Customers;
 
    items            : Composition of many ProposalItems
                       on items.proposals = $self;
 
    approvals        : Association to one ManagerApprovals on approvals.proposal = $self;
 
    rentalContracts  : Association to many RentalContracts
                       on rentalContracts.proposal = $self;
}
 
 
entity ProposalItems : cuid {
 
    quantity         : Integer;
 
    requestType      : String;
    // RENTAL, SALES
 
    rentalDuration   : Integer;
 
    startDate        : Date;
    endDate          : Date;
 
    unitPrice        : Decimal;
 
    estimatedAmount  : Decimal;
    // Quantity * Unit Price

    needed_machineOperator : Integer;
 
    proposals:Association to Proposals;

    product : Association to Product;

}

// entity EquipmentBookings :  cuid, managed {
//     equipmentName : String;
    
// }


entity ManagerApprovals : cuid, managed {
 
    reviewDate       : Date;
 
    decision         : String;
    // APPROVED, REJECTED
 
    comments         : String;
 
    approvedAmount   : Decimal;
 
    proposal         : Association to Proposals;
}
 

entity RentalContracts : cuid, managed {
 
    contractNumber    : String;
 
    contractDate      : Date;
 
    startDate         : Date;
    endDate           : Date;
 
    totalRentalAmount : Decimal;
 
    contractStatus    : String default 'Active';
    // ACTIVE, COMPLETED, CANCELLED
 
    proposal          : Association to Proposals;
 
    customer          : Association to Customers;
 
    allocations       : Association to many RentalAllocations
                        on allocations.rentalContract = $self;
}
 
 
entity RentalAllocations : cuid, managed {
 
    allocationNumber     : String;
 
    allocationDate       : Date;
 
    allocationStartDate  : Date;
    allocationEndDate    : Date;
 
    allocationStatus     : String default 'Pending';
    // PENDING, ALLOCATED, HANDED_OVER,
    // RELEASED, CANCELLED

    allocatedBy          : String;
    
    operator            : Association to Machine_Operator;
 
    rentalContract       : Association to RentalContracts;

    equipment            : Association to Rental_Physical_Equipment;
}


 