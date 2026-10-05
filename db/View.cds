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


// entity UnderReview as select from view.Proposals as prop {
//     count(*) as underReviewData
// } where prop.proposalStatus == 'Under Review';

// entity Pending as select from view.Proposals as prop {
//     count(*) as pendingData
// } where prop.proposalStatus == 'Pending';

// entity Rejected as select from view.Proposals as prop {
//     count(*) as rejectData
// } where prop.proposalStatus == 'Rejected';

