namespace proposal.srv;

using {Master.db as db} from '../db/Schema';

service Masterapi {
    entity Product as projection on db.Product;
    entity Rental_Physical_Equipment as projection on db.Rental_Physical_Equipment;
    entity Rental_Equipment_Pricing  as projection on db.Rental_Equipment_Pricing;
    entity Machine_Operator as projection on db.Machine_Operator;
    entity Spare_Parts as projection on db.Spare_Parts;
    entity Attachment as projection on db.Attachment;
    entity Rental_Attachment_Pricing as projection on db.Rental_Attachment_Pricing;
    entity Prod_Attach as projection on db.Prod_Attach;
    entity Spare_Product as projection on db.Spare_Product;
    entity Prod_Operator as projection on db.Prod_Operator;
   
}

service customerapi {
    entity Customers as projection on db.Customers;
    entity Proposals as projection on db.Proposals;
    entity ProposalItems as projection on db.ProposalItems;
}

service managerapi {
    entity Proposals as projection on db.Proposals;
    entity ProposalItems as projection on db.ProposalItems;
    entity ManagerApprovals as projection on db.ManagerApprovals;
}

service salesapi {
    entity RentalContracts as projection on db.RentalContracts;
    entity RentalAllocations as projection on db.RentalAllocations;
}

