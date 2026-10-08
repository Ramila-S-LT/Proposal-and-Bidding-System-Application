namespace viewsObject;

using {Master.db as view} from './Schema';

entity Approval as select from view.Proposals as prop {
    key prop.proposalStatus,
    count(*) as proposalCount : Integer
} group by prop.proposalStatus;

entity CustomerData as select from view.Customers as prop {
    key prop.status,
    count(*) as customerCount : Integer
} group by prop.status;


entity EquipmentStatusCount as select from view.Rental_Physical_Equipment as RPE {
    key RPE.status,
    count(*) as Equipment_Count : Integer
} group by RPE.status;

entity EquipmentCOuntByProd as select from view.Product as P left join view.Rental_Physical_Equipment as E on E.product_ref.ID = P.ID {
    key P.ID,
    P.product_Name,
    count(E.ID) as eqipmentCount : Integer
} group by P.ID, P.product_Name;



// entity UnderReview as select from view.Proposals as prop {
//     count(*) as underReviewData
// } where prop.proposalStatus == 'Under Review';

// entity Pending as select from view.Proposals as prop {
//     count(*) as pendingData
// } where prop.proposalStatus == 'Pending';

// entity Rejected as select from view.Proposals as prop {
//     count(*) as rejectData
// } where prop.proposalStatus == 'Rejected';

