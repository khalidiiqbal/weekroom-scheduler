const assert = require("node:assert/strict");
const scheduler = require("../scheduler.js");

const emptyWeek = () => Object.fromEntries(scheduler.days.map(day => [day, []]));
const settings = { dayStart:"08:00", dayEnd:"22:00", breakMinutes:15, balanceWeek:true, compactDays:true };
const goal = overrides => ({ id:"g1", name:"Gym", type:"gym", mode:"sessions", sessionCount:4,
    sessionMinutes:60, totalMinutes:240, priority:"normal", preferredTime:"evening",
    allowedDays:scheduler.days.slice(0, 5), deadlineDay:"", notes:"", ...overrides });

assert.deepEqual(scheduler.parseGoalLine("4 1-hour gym sessions"), {
    name:"gym", type:"gym", mode:"sessions", sessionCount:4, sessionMinutes:60, totalMinutes:240
});
assert.equal(scheduler.parseGoalLine("4 hours of job searching").type, "work");
assert.equal(scheduler.parseGoalLine("play guitar for 2 hours").type, "hobby");
assert.match(scheduler.parseGoalLine("play guitar").error, /Add an amount/);

const week = emptyWeek();
week.monday.push({id:"fixed",name:"Class",type:"class",day:"monday",startTime:"09:00",endTime:"12:00",location:"",details:""});
let result = scheduler.schedule(week, [goal({})], settings);
assert.equal(result.error, "");
assert.equal(result.scheduled.length, 4);
assert.equal(result.unscheduled.length, 0);
assert.equal(new Set(result.scheduled.map(task => task.day)).size, 4, "Repeated sessions should spread across days");
assert.ok(result.scheduled.every(task => scheduler.toMinutes(task.startTime) >= 17 * 60), "Evening preference should win when available");
assert.ok(result.scheduled.every(task => !(task.day === "monday" && task.startTime < "12:15" && task.endTime > "08:45")), "Generated work must respect fixed commitments and break");

result = scheduler.schedule(week, [goal({deadlineDay:"wednesday",allowedDays:["monday","tuesday","wednesday"]})], settings);
assert.equal(result.scheduled.length, 4);
assert.equal(result.unscheduled.length, 0);
assert.ok(result.scheduled.every(task => scheduler.days.indexOf(task.day) <= 2), "Deadline is a hard latest day");

// A narrow window proves partial scheduling and never creates overlaps.
const narrowWeek = emptyWeek();
narrowWeek.monday.push({id:"fixed",name:"Class",type:"class",day:"monday",startTime:"08:00",endTime:"09:00",location:"",details:""});
result = scheduler.schedule(narrowWeek, [goal({sessionCount:2,allowedDays:["monday"],preferredTime:"any"})],
    {...settings,dayStart:"08:00",dayEnd:"10:00",breakMinutes:15});
assert.equal(result.scheduled.length, 1);
assert.equal(result.scheduled[0].startTime, "09:00");
assert.equal(result.unscheduled.length, 1);

const totalGoal = goal({mode:"total",totalMinutes:150,sessionMinutes:60,sessionCount:3});
assert.deepEqual(scheduler.buildSessions(totalGoal).map(session => session.duration), [60,60,30]);
assert.match(scheduler.validateGoal(goal({allowedDays:[]})), /available day/);
assert.match(scheduler.schedule(week,[goal({})],{...settings,dayStart:"22:00",dayEnd:"08:00"}).error,/window/);

const withOldGenerated = emptyWeek();
withOldGenerated.monday.push(week.monday[0], {id:"old",goalId:"old-goal",generated:true,name:"Old",type:"study",day:"monday",startTime:"18:00",endTime:"19:00",location:"",details:""});
const applied = scheduler.applyGenerated(withOldGenerated, result.scheduled);
assert.ok(applied.monday.some(task => task.id === "fixed"));
assert.ok(!applied.monday.some(task => task.id === "old"));
assert.ok(scheduler.days.every(day => applied[day].every((task,index,array) => !index || array[index-1].startTime <= task.startTime)));
console.log("PASS: quick descriptions, validation, preferences, fixed conflicts, breaks, balancing, partial plans, splitting, and generated-session replacement.");

// Personal routines must take precedence over flexible work.
const personal = { sleepEnabled:true, sleepHours:8, wakeTime:'07:00', lunchEnabled:true,
    lunchStart:'11:30', lunchEnd:'14:30', lunchMinutes:45, routines:[] };
const campusWeek = emptyWeek();
campusWeek.monday = [
    {id:'am', name:'Lecture', type:'class', day:'monday', startTime:'09:00', endTime:'12:00'},
    {id:'pm', name:'Lab', type:'class', day:'monday', startTime:'13:00', endTime:'16:00'}
];
result = scheduler.schedule(campusWeek, [goal({sessionCount:12,allowedDays:['monday'],preferredTime:'any'})], {...settings,dayStart:'00:00',dayEnd:'23:59', personal});
const lunch = result.scheduled.find(task => task.routine);
assert.equal(lunch.startTime,'12:00');
assert.equal(lunch.endTime,'12:45');
assert.ok(result.scheduled.every(task => task.startTime >= '07:00' && task.endTime <= '23:00'));
for (const a of result.scheduled) for (const b of result.scheduled) {
    if (a !== b && a.day === b.day) assert.ok(a.endTime <= b.startTime || a.startTime >= b.endTime);
}
assert.equal(scheduler.parseGoalLine('8 hours of sleep each night').hours,8);
assert.equal(scheduler.parseGoalLine('leave lunch time during my time on campus').preference,'lunch');
assert.equal(scheduler.parseGoalText('8 hours of sleep each night\n2 hours of study').goals.length,1);
result = scheduler.schedule(campusWeek, [], {...settings,personal:{...personal,lunchMinutes:90}});
assert.equal(result.unscheduled.length,1);
result = scheduler.schedule(campusWeek, [], {...settings,personal:{...personal,routines:[{name:'Dinner',start:'18:00',end:'19:00',days:scheduler.days}]}});
assert.equal(result.scheduled.filter(task => task.name === 'Dinner').length,7);
assert.equal(result.warnings.length,0);
result = scheduler.schedule(campusWeek, [], {...settings,personal:{...personal,routines:[{name:'Rest',start:'10:00',end:'11:00',days:['monday']}]}});
assert.equal(result.warnings.length,1);
assert.ok(!result.scheduled.some(task => task.name === 'Rest'));
result = scheduler.schedule(campusWeek, [], {...settings,personal:{...personal,sleepHours:12,wakeTime:'10:00'}});
assert.ok(result.warnings.some(warning => warning.includes('sleep')));
assert.match(scheduler.schedule(emptyWeek(),[],{...settings,personal:{...personal,sleepHours:0}}).error,/sleep/);
assert.match(scheduler.schedule(emptyWeek(),[],{...settings,personal:{...personal,lunchEnd:'11:00'}}).error,/Lunch/);
console.log('PASS: sleep across midnight, campus lunch, protected routines, impossible preferences, and natural-language preferences.');
