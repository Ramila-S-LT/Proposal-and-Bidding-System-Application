namespace Master.db;

using { cuid } from '@sap/cds/common';

entity Product : cuid {
    product_Type : String;  //identifies what type of product it is ...like Road roaler,JCB
    product_Code : String;  //unic busiess code used to identify the product
    product_Name : String;  //name of the product
    product_Group: String;  //Group similer products ....like construction equipments
    Category     : String;  //more specific classification
    Discription  : String;
    Model        : String;  //version or model of the machines
    Status       : String;


    rent_equipment_ref : Composition of many Rental_Physical_Equipment on rent_equipment_ref.product_ref = $self;
    rental_pricing_ref : Association to one Rental_Equipment_Pricing on rental_pricing_ref.product_ref = $self;
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


entity Rental_Equipment_Pricing : cuid {
    Daily_Rental_Rate   : Integer; //Rental price per day
    Weekly_Rental_Rate  : Integer; //rental price per week
    Monthly_Rental_Rate : Integer; //rental price per month
    
    product_ref : Association to Product;

}


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

    Prod_attach_junc : Association to  many Prod_Attach on Prod_attach_junc.attachment_ref = $self;
    attach_Price_ref : Composition of one Rental_Attachment_Pricing on attach_Price_ref.attachment_ref = $self;

}


entity Rental_Attachment_Pricing : cuid {

    Daily_Rental_Rate   : Decimal(15,2);
    Weekly_Rental_Rate  : Decimal(15,2);
    Monthly_Rental_Rate : Decimal(15,2);
    Minimum_Rental_Days : Integer;

    attachment_ref : Association to one Attachment;
}


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



