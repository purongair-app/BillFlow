export const nationalIdDigits=(value:string)=>value.replace(/[^0-9]/g,'').slice(0,13);
export function formatNationalId(value:string){const digits=nationalIdDigits(value);let offset=0;return [1,4,5,2,1].map(size=>{const part=digits.slice(offset,offset+size);offset+=size;return part;}).filter(Boolean).join(' - ');}
export function nationalIdCaret(display:string,count:number){if(count<=0)return 0;let digits=0;for(let i=0;i<display.length;i++)if(/[0-9]/.test(display[i])&&++digits===count)return i+1;return display.length;}
