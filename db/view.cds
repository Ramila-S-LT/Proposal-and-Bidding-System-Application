namespace viewObject;

using{Master.db as db} from '../db/Schema';

entity RentalContract as select from db.RentalContracts as RC {
    key RC.contractStatus,
    count(*) as rcs : Integer
} group by RC.contractStatus;

entity proposalCount as select from db.Proposals as prop {
    key prop.proposalStatus,
    count(*) as ps : Integer
} group by prop.proposalStatus;
