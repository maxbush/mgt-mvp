import type { Contract, Student } from "./types";
import type { DataState } from "./selectors";
import { currentBalance, currentContract, yearById, branchById, studentGroups } from "./selectors";
import { fullName } from "./utils";

export interface StudentRow {
  id: string;
  student: Student;
  fullName: string;
  status: Student["status"];
  branchId: string;
  branchName: string;
  branchShort: string;
  branchColor: string;
  groupIds: string[];
  groupNames: string[];
  grade: string;
  birthYear: number;
  parentName: string;
  parentPhone: string;
  contract?: Contract;
  contractNumber: string;
  contractDate: string;
  yearId: string;
  yearLabel: string;
  balance: number;
  allContractNumbers: string;
}

export function buildStudentRows(state: DataState, withBalance = true): StudentRow[] {
  return state.students.map((s) => {
    const branch = branchById(state, s.branchId);
    const groups = studentGroups(state, s.id);
    const contract = currentContract(state, s.id);
    const year = contract ? yearById(state, contract.academicYearId) : undefined;
    return {
      id: s.id,
      student: s,
      fullName: fullName(s),
      status: s.status,
      branchId: s.branchId,
      branchName: branch?.name ?? "",
      branchShort: branch?.shortName ?? "",
      branchColor: branch?.color ?? "#999",
      groupIds: groups.map((g) => g.id),
      groupNames: groups.map((g) => g.name),
      grade: s.grade,
      birthYear: s.birthYear,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
      contract,
      contractNumber: contract?.number ?? "",
      contractDate: contract?.date ?? "",
      yearId: contract?.academicYearId ?? "",
      yearLabel: year?.label ?? "",
      balance: withBalance ? currentBalance(state, s.id) : 0,
      allContractNumbers: state.contracts.filter((c) => c.studentId === s.id).map((c) => c.number).join(" "),
    };
  });
}
