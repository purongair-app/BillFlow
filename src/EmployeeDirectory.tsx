import type {State} from './money';
import PeopleDirectory from './PeopleDirectory';
export default function EmployeeDirectory(props:{state:State,busy:boolean,onSave:(s:State,text:string)=>Promise<boolean>}){return <PeopleDirectory {...props} initialType="employee"/>;}
