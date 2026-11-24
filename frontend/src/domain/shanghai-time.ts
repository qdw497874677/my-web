const localPattern=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

export function toShanghaiDateTimeLocal(value?:string|null):string{
  if(!value)return''
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return''
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date)
  const part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===type)?.value??''
  return`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

export function fromShanghaiDateTimeLocal(value:string):string{
  const match=localPattern.exec(value)
  if(!match)throw new Error('排期时间格式无效')
  const [,yearText,monthText,dayText,hourText,minuteText]=match
  const year=Number(yearText),month=Number(monthText),day=Number(dayText),hour=Number(hourText),minute=Number(minuteText)
  const probe=new Date(Date.UTC(year,month-1,day,hour,minute))
  if(probe.getUTCFullYear()!==year||probe.getUTCMonth()!==month-1||probe.getUTCDate()!==day||hour>23||minute>59)throw new Error('排期时间格式无效')
  return`${value}:00+08:00`
}
