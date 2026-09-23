// Optional developer checks: node tests/timetable-parser.test.cjs
// Node is not needed to run the app. No test packages are required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const parser = require("../timetable-parser.js");

assert.deepEqual(parser.findDays("Mon / Wed / Fri"), ["monday", "wednesday", "friday"]);
assert.equal(parser.findTimeRange("ECE 231-232"), null);
assert.equal(parser.findTimeRange("10:30–12:00").startTime, "10:30");
assert.equal(parser.findTimeRange("11:00-1:00 PM").startTime, "11:00");
assert.equal(parser.findTimeRange("11:00-1:00 PM").endTime, "13:00");
assert.equal(parser.findTimeRange("12:00 AM to 1:00 AM").startTime, "00:00");
assert.equal(parser.findTimeRange("9-10pm").startTime, "21:00");
assert.equal(parser.findTimeRange("25:00-26:00").startTime, "");
const parsed = parser.parseText("Monday | ECE231 | 10:00-12:00 | Room BA123\nTue / Thu | Lab | 1 PM-2 PM");
assert.equal(parsed.length, 3);
assert.equal(parsed[0].name, "ECE231");
assert.equal(parsed[0].location, "Room BA123");
assert.equal(parsed[2].day, "thursday");
assert.equal(parsed[1].startTime, "13:00");
assert.equal(parser.parseText("Monday\nECE Lecture\n10:00-12:00")[0].name, "ECE Lecture");
assert.equal(parser.parseText("Lecture | 10:00-11:00")[0].day, "");
assert.deepEqual(parser.parseText("No timetable here"), []);
const items = [
    {text:"Monday", x:100,y:50,width:50}, {text:"Tuesday",x:300,y:50,width:50},
    {text:"ECE Lecture",x:90,y:100,width:80}, {text:"10:00-12:00",x:90,y:116,width:80},
    {text:"Room BA123",x:90,y:132,width:80},
    {text:"Physics Lab",x:290,y:100,width:80}, {text:"09:00-11:00",x:290,y:116,width:80}
];
const grid = parser.parsePage(items.reverse(), 2);
assert.equal(grid.length, 2);
assert.equal(grid[0].name, "ECE Lecture");
assert.equal(grid[0].day, "monday");
assert.equal(grid[1].day, "tuesday");
assert.equal(grid[0].location, "Room BA123");

const acornItems = [
    {text:"ACORN",x:10,y:20,width:30},
    {text:"Monday",x:120,y:50,width:50}, {text:"Tuesday",x:300,y:50,width:50},
    {text:"9:00",x:20,y:100,width:25}, {text:"1:00",x:20,y:200,width:25},
    {text:"MAT290H1 F",x:110,y:95,width:55}, {text:"LEC 0103 (In",x:110,y:108,width:55},
    {text:"Person)",x:110,y:121,width:35}, {text:"9:00 - 10:00",x:110,y:134,width:50}, {text:"BA 1170",x:110,y:147,width:35},
    {text:"ECE231H1 F",x:290,y:195,width:55}, {text:"PRA 0106 (In",x:290,y:208,width:55},
    {text:"Person)",x:290,y:221,width:35}, {text:"(Alternating Weeks)",x:290,y:234,width:90},
    {text:"1:00 - 4:00",x:290,y:247,width:50}, {text:"GB 341",x:290,y:260,width:35}
];
const acorn = parser.parsePage(acornItems, 1);
assert.equal(acorn.length, 2);
assert.equal(acorn[0].name, "MAT290H1 F LEC 0103");
assert.equal(acorn[0].startTime, "09:00");
assert.equal(acorn[1].day, "tuesday");
assert.equal(acorn[1].startTime, "13:00");
assert.equal(acorn[1].endTime, "16:00");
assert.equal(acorn[1].selected, false, "Alternating-week meetings need deliberate selection");
assert.match(acorn[1].details, /Alternating weeks/);

// Exercise real planner batch logic with a minimal DOM and storage adapter.
const elements = new Map();
function element() {
    return { value:"", textContent:"", classList:{add(){},toggle(){}},
        setAttribute(){}, addEventListener(){}, appendChild(){}, append(){}, focus(){} };
}
let saved = "";
const context = vm.createContext({ document: {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement:element
}, localStorage:{getItem(){return null;},setItem(key,value){saved=value;}}, console });
vm.runInContext(fs.readFileSync(require.resolve("../calendar-card.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(require.resolve("../planner.js"), "utf8"), context);
const run = code => vm.runInContext(code, context);
context.batch = parsed;
assert.equal(run("importTasks(batch)"), true);
assert.equal(run("week.monday.length + week.tuesday.length + week.thursday.length"), 3);
assert.ok(saved.includes("ECE231"));
const before = run("JSON.stringify(week)");
assert.equal(run("importTasks(batch)"), false);
assert.equal(run("JSON.stringify(week)"), before);
assert.equal(run('importTasks([{...batch[0],name:"New",startTime:"08:00",endTime:"09:00"}, {...batch[0],name:"Overlap",startTime:"11:00",endTime:"13:00"}])'), false);
assert.equal(run("JSON.stringify(week)"), before, "One conflict must prevent the entire batch");
assert.equal(run('importTasks([{...batch[0],name:"Next",startTime:"12:00",endTime:"13:00"}])'), true);
assert.equal(run('importTasks([{...batch[0],day:"sunday"},{...batch[0],day:"sunday",name:"Conflict"}])'), false);
assert.equal(run('importTasks([{...batch[0],day:""}])'), false);
assert.equal(run('week.monday[0].source'), undefined);
console.log("PASS: parser times/days/layout, missing data, batch conflicts, duplicates, boundaries, atomic save, and planner-only persistence.");
