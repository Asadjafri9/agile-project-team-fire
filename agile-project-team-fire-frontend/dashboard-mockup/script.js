const sprintTasks = [
  { id:'5.1', title:'Sprint entity and management screens', points:5, priority:'High', owner:'Maya', initials:'MY', status:'Done', description:'Define sprint duration, start and end dates, and a clear sprint goal.' },
  { id:'5.2', title:'Sprint capacity planner', points:5, priority:'Medium', owner:'Ali', initials:'AL', status:'Done', description:'Show available team hours and total story point capacity before commitment.' },
  { id:'5.3', title:'Backlog-to-sprint allocation', points:3, priority:'Medium', owner:'Sara', initials:'SR', status:'Done', description:'Move selected product backlog items into the active sprint.' },
  { id:'5.4', title:'Sprint lifecycle controls', points:8, priority:'High', owner:'Omar', initials:'OM', status:'Code Review', description:'Start and complete a sprint, then carry over unresolved items.' },
  { id:'5.5', title:'Sprint commitment snapshot', points:5, priority:'High', owner:'Sara', initials:'SR', status:'Done', description:'Freeze committed scope at sprint start as the baseline for burndown.' },
  { id:'5.6', title:'Kanban board rendering', points:8, priority:'Critical', owner:'Maya', initials:'MY', status:'Done', description:'Render To Do, In Progress, Code Review, Testing, and Done columns.' },
  { id:'5.7', title:'Drag-and-drop status persistence', points:13, priority:'Critical', owner:'Zain', initials:'ZN', status:'In Progress', description:'Move cards between columns and store every status transition reliably.' },
  { id:'5.8', title:'In-context task detail modal', points:5, priority:'Medium', owner:'Nina', initials:'NN', status:'Testing', description:'Let teammates inspect and edit a task without leaving the board.' },
  { id:'5.9', title:'Increment testing and sprint demonstration', points:3, priority:'High', owner:'Alex', initials:'AC', status:'To Do', description:'Verify the increment and demonstrate the working sprint board.' }
];
const futureTasks = [
  { id:'6.1', title:'Status-history metrics computation', points:8, priority:'High', owner:'Ali', initials:'AL', status:'Backlog', description:'Derive sprint metrics from the stored status history.' },
  { id:'6.2', title:'Automated burndown chart', points:8, priority:'High', owner:'Sara', initials:'SR', status:'Backlog', description:'Plot remaining story points against the ideal completion slope.' },
  { id:'6.3', title:'Team velocity chart', points:5, priority:'Medium', owner:'Nina', initials:'NN', status:'Backlog', description:'Compare completed story points across past sprints.' },
  { id:'6.4', title:'Cumulative Flow Diagram', points:8, priority:'Medium', owner:'Omar', initials:'OM', status:'Backlog', description:'Show the distribution of tasks across board statuses over time.' },
  { id:'6.6', title:'Work-In-Progress limits', points:5, priority:'High', owner:'Zain', initials:'ZN', status:'Backlog', description:'Surface bottlenecks with configurable limits on each board column.' }
];
const allTasks = [...sprintTasks, ...futureTasks];
const columns = [
  {name:'To Do',color:'#9daac0',light:'#eef1f6'},
  {name:'In Progress',color:'#edaa66',light:'#fff3e8'},
  {name:'Code Review',color:'#8d80eb',light:'#f0edff'},
  {name:'Testing',color:'#4d9dda',light:'#e8f3ff'},
  {name:'Done',color:'#47bfa3',light:'#e6f8f2'}
];
const members = [
  {name:'Alex Carter',role:'Scrum Master',initials:'AC',color:'#f6c2a9'},
  {name:'Sara Rahman',role:'Product Owner',initials:'SR',color:'#e2d9fb'},
  {name:'Maya Khan',role:'Developer',initials:'MY',color:'#f6dba9'},
  {name:'Zain Ahmed',role:'Developer',initials:'ZN',color:'#c5e7dc'},
  {name:'Ali Raza',role:'Developer',initials:'AL',color:'#cce0fa'},
  {name:'Nina Shah',role:'Developer',initials:'NN',color:'#f5d0db'},
  {name:'Omar Malik',role:'Viewer / QA',initials:'OM',color:'#d4def4'}
];
const viewLabels={overview:'Overview',backlog:'Product backlog',board:'Sprint board',analytics:'Analytics',team:'Team',artefacts:'Agile artefacts'};
let currentView='overview';
let toastTimer;
const app=document.getElementById('app');
const icon=(name)=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const totalPoints=()=>sprintTasks.reduce((sum,task)=>sum+task.points,0);
const completedPoints=()=>sprintTasks.filter(task=>task.status==='Done').reduce((sum,task)=>sum+task.points,0);
const percentage=()=>Math.round(completedPoints()/totalPoints()*100);
const escapeText=(value)=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function pageHeading(eyebrow,title,subtitle,actions=''){
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function statCard(label,value,foot,iconName,tone){
  return `<article class="stat-card"><div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon ${tone}">${icon(iconName)}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
}
function graphSvg(){
  const ideal=[55,49,44,38,33,27,22,16,11,5,0];
  const actual=[55,55,50,46,40,35,totalPoints()-completedPoints()];
  const x=index=>38+index*54;
  const y=value=>178-value*2.72;
  const line=values=>values.map((value,index)=>`${index?'L':'M'}${x(index)} ${y(value).toFixed(1)}`).join(' ');
  const area=`${line(actual)} L${x(actual.length-1)} 178 L38 178 Z`;
  return `<div class="chart-wrap"><svg viewBox="0 0 610 220" role="img" aria-label="Burndown chart: ${totalPoints()-completedPoints()} story points remain on day 6, compared with 22 ideally"><defs><linearGradient id="area-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#746eef" stop-opacity=".18"/><stop offset="1" stop-color="#746eef" stop-opacity="0"/></linearGradient></defs>${[55,40,25,10,0].map(value=>`<line class="gridline" x1="38" y1="${y(value)}" x2="590" y2="${y(value)}"/><text x="5" y="${y(value)+3}">${value}</text>`).join('')}<path class="ideal-line" d="${line(ideal)}"/><path class="actual-fill" d="${area}"/><path class="actual-line" d="${line(actual)}"/><circle class="dot" cx="${x(6)}" cy="${y(actual[6])}" r="5"/>${[0,2,4,6,8,10].map(day=>`<text x="${x(day)-10}" y="208">Day ${day}</text>`).join('')}</svg></div>`;
}
function burndownCard(){
  const gap=totalPoints()-completedPoints()-22;
  return `<section class="card"><div class="card-head"><div><h2 class="card-heading">Sprint burndown</h2><p class="card-subtitle">Story points remaining · day 6 of 10</p></div><div class="legend"><span><i class="actual"></i>Actual</span><span><i class="ideal"></i>Ideal</span></div></div>${graphSvg()}<div class="chart-note">${icon('flag')} ${gap>0?`${gap} points above the ideal line. Focus on high-effort board work.`:'The sprint is on or ahead of its ideal line.'}</div></section>`;
}
function focusCard(){
  const priorityOrder={Critical:0,High:1,Medium:2,Low:3};
  const attention=sprintTasks.filter(task=>task.status!=='Done').sort((a,b)=>priorityOrder[a.priority]-priorityOrder[b.priority]).slice(0,3);
  return `<section class="card"><div class="card-head"><div><h2 class="card-heading">Needs your attention</h2><p class="card-subtitle">The next things to move forward</p></div>${icon('more')}</div><div class="focus-list">${attention.length?attention.map((task,index)=>`<div class="focus-item"><span class="focus-marker ${index===1?'purple':index===2?'teal':''}"></span><div class="focus-main"><strong>${escapeText(task.title)}</strong><small>WBS ${task.id} · ${task.status}</small></div>${task.priority==='Critical'?'<span class="focus-badge">Critical</span>':`<span class="focus-trail">${task.points} pts</span>`}</div>`).join(''):'<div class="empty-state">All sprint work is done.</div>'}</div></section>`;
}
function miniBoard(){
  return `<section class="card board-card"><div class="card-head"><div><h2 class="card-heading">Sprint board</h2><p class="card-subtitle">A quick look at where the work stands</p></div><button class="text-button" type="button" data-view="board">Open board ${icon('arrow')}</button></div><div class="board-preview">${columns.map(column=>{const tasks=sprintTasks.filter(task=>task.status===column.name);const task=tasks[0];return `<div class="board-column"><div class="board-column-head"><span class="status-dot" style="background:${column.color}"></span><strong>${column.name}</strong><span class="count-badge">${tasks.length}</span></div>${task?`<button type="button" class="mini-task" data-task="${task.id}"><span class="mini-task-id">WBS ${task.id}</span><div class="mini-task-title">${escapeText(task.title)}</div><div class="mini-task-foot"><span class="point-pill">${task.points} pts</span><span class="mini-avatar">${task.initials}</span></div></button>`:'<div class="empty-column">No tasks yet</div>'}</div>`}).join('')}</div></section>`;
}
function velocityCard(){
  const data=[{label:'Sprint 0',value:8},{label:'Sprint 1',value:21},{label:'Sprint 2',value:completedPoints(),current:true}];
  return `<section class="card"><div class="card-head"><div><h2 class="card-heading">Team velocity</h2><p class="card-subtitle">Completed story points by sprint</p></div><button type="button" class="text-button" data-view="analytics">View analytics ${icon('arrow')}</button></div><div class="velocity-bars">${data.map(item=>`<div class="velocity-bar-group"><span class="velocity-value">${item.value}</span><div class="velocity-bar ${item.current?'current':''}" style="height:${Math.max(9,item.value/32*100)}%"></div><span class="velocity-label">${item.label}</span></div>`).join('')}</div><p class="velocity-footer">Sprint 2 is in progress; its final velocity is still changing.</p></section>`;
}
function evidenceCard(){
  const items=[['Sprint planning & commitment','Captured',true],['Daily standup logs','Up to date',true],['Burndown & velocity record','Live',true],['Review & retrospective','Upcoming',false]];
  return `<section class="card"><div class="card-head"><div><h2 class="card-heading">Process evidence</h2><p class="card-subtitle">Ceremony artefacts, collected as you go</p></div><button type="button" class="text-button" data-view="artefacts">View all ${icon('arrow')}</button></div>${items.map(([label,status,done])=>`<div class="evidence-item"><span class="evidence-check ${done?'':'pending'}">${icon(done?'check':'clock')}</span><strong>${label}</strong><small>${status}</small></div>`).join('')}</section>`;
}
function renderOverview(){
  const done=completedPoints();const remain=totalPoints()-done;const gap=remain-22;
  return `${pageHeading('Wednesday · Team Fire','Good morning, Alex <span aria-hidden="true">👋</span>','Here’s what is happening across your active sprint.',`<button class="button button-subtle" type="button" data-view="backlog">${icon('list')} View backlog</button><button class="button button-primary" type="button" data-view="board">${icon('board')} Open sprint board</button>`)}<section class="hero"><div class="hero-copy"><div class="hero-tag"><span></span> CURRENT SPRINT · INCREMENT 2</div><h2>Sprint 02: Sprints &amp; Board</h2><p>Build a live sprint board and give the team a clear path from backlog to done.</p><div class="hero-meta"><span>${icon('clock')} Day 6 of 10</span><span>${icon('flag')} 4 days remaining</span></div></div><div class="hero-progress"><div class="progress-ring" style="background:conic-gradient(#f7bc85 0 ${percentage()}%,#ffffff30 ${percentage()}% 100%)"><div><strong>${percentage()}%</strong><small>complete</small></div></div><div class="hero-progress-label"><strong>${done} / ${totalPoints()}</strong><span>story points<br>completed</span></div></div></section><div class="stats-grid">${statCard('Completed points',`${done}<small> / ${totalPoints()}</small>`,'Across the active sprint','check','violet')}${statCard('Remaining points',remain,gap>0?`<strong class="warning">${gap} pts behind</strong> ideal pace`:'<strong>On or ahead of</strong> ideal pace','flag','peach')}${statCard('Work in progress',sprintTasks.filter(t=>t.status==='In Progress').length,'<strong>WIP limit: 3</strong> items','board','mint')}${statCard('Sprint tasks',sprintTasks.length,`${sprintTasks.filter(t=>t.status==='Done').length} delivered · ${sprintTasks.filter(t=>t.status!=='Done').length} open`,'list','blue')}</div><div class="dashboard-grid">${burndownCard()}${focusCard()}</div>${miniBoard()}<div class="lower-grid">${velocityCard()}${evidenceCard()}</div>`;
}
function renderBacklog(){
  return `${pageHeading('Plan the work','Product backlog','Prioritised work from the WBS, with the active sprint and next increment side by side.',`<button class="button button-primary" type="button" id="export-backlog">Export CSV</button>`)}<div class="toolbar"><label class="search-field">${icon('search')}<input id="backlog-search" type="search" placeholder="Search WBS items, owner, or title" aria-label="Search backlog" /></label><select class="select" id="backlog-filter" aria-label="Filter by status"><option value="all">All statuses</option><option>Backlog</option>${columns.map(column=>`<option>${column.name}</option>`).join('')}</select><span class="demo-pill">${allTasks.length} work items</span></div><div class="card table-card"><table class="task-table"><thead><tr><th>Work item</th><th>Priority</th><th>Status</th><th>Owner</th><th>Points</th></tr></thead><tbody id="backlog-rows"></tbody></table></div>`;
}
function backlogRows(){
  const query=(document.getElementById('backlog-search')?.value||'').trim().toLowerCase();
  const filter=document.getElementById('backlog-filter')?.value||'all';
  const matches=allTasks.filter(task=>(filter==='all'||task.status===filter)&&`${task.id} ${task.title} ${task.owner}`.toLowerCase().includes(query));
  document.getElementById('backlog-rows').innerHTML=matches.length?matches.map(task=>`<tr><td class="task-title-cell"><button type="button" data-task="${task.id}">${escapeText(task.title)}</button><small>WBS ${task.id} · ${Number(task.id)<6?'Sprint 02':'Next increment'}</small></td><td><span class="priority ${task.priority.toLowerCase()}">${task.priority}</span></td><td><span class="status-pill" style="background:${columns.find(c=>c.name===task.status)?.light||'#f0f2f7'};color:${columns.find(c=>c.name===task.status)?.color||'#75829a'}">${task.status}</span></td><td><span class="person-cell"><span class="mini-avatar">${task.initials}</span>${task.owner}</span></td><td><span class="point-pill">${task.points} pts</span></td></tr>`).join(''):`<tr><td colspan="5" class="empty-state">No work items match your search.</td></tr>`;
}
function renderBoard(){
  return `${pageHeading('Sprint 02 · Day 6 of 10','Sprint board','The WBS-defined workflow from To Do through Done. Move cards to try the mock interaction.',`<button class="button button-subtle" type="button" data-view="backlog">${icon('list')} Product backlog</button>`)}<div class="kanban-board">${columns.map(column=>{const tasks=sprintTasks.filter(task=>task.status===column.name);return `<section class="kanban-col" data-column="${column.name}"><div class="board-column-head"><span class="status-dot" style="background:${column.color}"></span><strong>${column.name}</strong><span class="count-badge">${tasks.length}${column.name==='In Progress'?' / 3':''}</span></div>${tasks.map(task=>`<button type="button" class="kanban-task" draggable="true" data-task="${task.id}"><span class="task-id">WBS ${task.id}</span><h3>${escapeText(task.title)}</h3><p>${task.priority} priority</p><div class="kanban-task-foot"><span class="point-pill">${task.points} pts</span><span class="mini-avatar">${task.initials}</span></div></button>`).join('')}${tasks.length?'':'<div class="empty-column">Drop a task here</div>'}</section>`}).join('')}</div><p class="kanban-hint">Drag a card between columns, or open it to change status. Changes last for this preview session.</p>`;
}
function flowChart(){
  const records=[[4,2,1,1,1],[4,2,1,1,1],[3,2,1,1,2],[3,2,1,1,2],[2,2,1,1,3],[1,2,1,1,4],[1,1,1,1,5]];
  const colors=['#adb7c8','#f0b477','#978beb','#74b4e2','#52c7a8'];
  return `<div class="flow-chart" role="img" aria-label="Sample cumulative flow of tasks across seven days">${records.map((record,index)=>`<div class="flow-col"><div class="flow-stack" style="--height:145px">${record.map((amount,i)=>`<span style="height:${amount/9*100}%;background:${colors[i]}"></span>`).join('')}</div><div class="flow-label">D${index+1}</div></div>`).join('')}</div><div class="flow-legend">${columns.map((column,i)=>`<span><i style="background:${colors[i]}"></i>${column.name}</span>`).join('')}</div>`;
}
function renderAnalytics(){
  return `${pageHeading('Track the outcome','Sprint analytics','A mock reporting view for the Scrum Master, shaped by the WBS analytics increment.',`<button class="button button-primary" type="button" id="export-summary">Export summary CSV</button>`)}<div class="stats-grid">${statCard('Committed scope',totalPoints(),'Story points at sprint start','flag','violet')}${statCard('Completed',completedPoints(),'Points in Done','check','mint')}${statCard('Still open',totalPoints()-completedPoints(),'Points in active work','clock','peach')}${statCard('Current velocity',completedPoints(),'Sprint 02 · provisional','chart','blue')}</div><div class="analytics-grid">${burndownCard()}<section class="card"><div class="card-head"><div><h2 class="card-heading">Sprint health</h2><p class="card-subtitle">Signals from the current snapshot</p></div></div><div class="metric-stack"><div class="metric-row"><span>Delivery pace</span><strong>${totalPoints()-completedPoints()>22?'Needs attention':'On track'}</strong></div><div class="metric-row"><span>Points above ideal</span><strong>${Math.max(0,totalPoints()-completedPoints()-22)}</strong></div><div class="metric-row"><span>In Progress / WIP limit</span><strong>${sprintTasks.filter(t=>t.status==='In Progress').length} / 3</strong></div><div class="metric-row"><span>Items awaiting review</span><strong>${sprintTasks.filter(t=>t.status==='Code Review').length}</strong></div></div></section></div><div class="lower-grid">${velocityCard()}<section class="card"><div class="card-head"><div><h2 class="card-heading">Cumulative flow</h2><p class="card-subtitle">Illustrative status distribution over seven days</p></div></div>${flowChart()}</section></div><p class="kanban-hint">In the planned product, these charts are reconstructed from the status-history table specified in WBS 3.2. Values here are demo data.</p>`;
}
function renderTeam(){
  return `${pageHeading('People behind the sprint','Team Fire','A sample cross-functional team with the project roles defined in the WBS.')}<div class="team-grid">${members.map(member=>`<article class="card team-card"><span class="avatar" style="background:${member.color}">${member.initials}</span><div><strong>${member.name}</strong><small>${member.role}</small></div></article>`).join('')}</div>`;
}
function renderArtefacts(){
  const artefacts=[['Sprint planning & commitment','WBS 2.1 · Sprint goal, selected backlog, and committed scope.','Captured','flag'],['Daily standup logs','WBS 2.2 · Short notes on progress, blockers, and next steps.','Up to date','list'],['Backlog refinement','WBS 2.3 · Prioritised, estimated stories ready for the next sprint.','In progress','board'],['Sprint review & demonstration','WBS 2.4 · Working increment and stakeholder feedback.','Upcoming','spark'],['Retrospective action items','WBS 2.5 · Improvements agreed by the team after each sprint.','Upcoming','users'],['Burndown & velocity record','WBS 2.6 · Ongoing chart evidence for the process portfolio.','Live','chart']];
  return `${pageHeading('Keep the process visible','Agile artefacts','Ceremony records are part of the deliverable, as described in WBS sections 2 and 8.3.')}<div class="artefact-grid">${artefacts.map(([title,description,status,iconName])=>`<article class="card artefact-card"><span class="artefact-icon">${icon(iconName)}</span><div><h3>${title}</h3><p>${description}</p><small>${status}</small></div></article>`).join('')}</div>`;
}
function render(){
  const views={overview:renderOverview,backlog:renderBacklog,board:renderBoard,analytics:renderAnalytics,team:renderTeam,artefacts:renderArtefacts};
  app.innerHTML=views[currentView]();
  document.querySelectorAll('.nav-link').forEach(button=>button.classList.toggle('active',button.dataset.view===currentView));
  document.getElementById('breadcrumb-current').textContent=viewLabels[currentView];
  document.title=`${viewLabels[currentView]} · Sprintwise`;
  if(currentView==='backlog')backlogRows();
}
function navigate(view){
  if(!viewLabels[view])return;
  currentView=view;render();window.scrollTo({top:0,behavior:'smooth'});
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
}
function showToast(message){
  const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('visible'),3200);
}
function openTask(id){
  const task=allTasks.find(item=>item.id===id);if(!task)return;
  const modal=document.getElementById('task-modal');
  document.getElementById('modal-content').innerHTML=`<div class="modal-kicker">WBS ${task.id} · ${Number(task.id)<6?'Sprint 02':'Next increment'}</div><h2 id="modal-title">${escapeText(task.title)}</h2><p>${escapeText(task.description)}</p><div class="modal-details"><div class="modal-detail"><label>Owner</label><strong>${task.owner}</strong></div><div class="modal-detail"><label>Estimate</label><strong>${task.points} story points</strong></div><div class="modal-detail"><label>Priority</label><span class="priority ${task.priority.toLowerCase()}">${task.priority}</span></div><div class="modal-detail"><label>WBS reference</label><strong>${task.id}</strong></div></div><div class="modal-status"><label for="task-status">Status</label><select class="select" id="task-status" data-id="${task.id}">${[...(Number(task.id)<6?[]:['Backlog']),...columns.map(c=>c.name)].map(status=>`<option ${task.status===status?'selected':''}>${status}</option>`).join('')}</select></div><p class="modal-footer">This is a local UI preview. Status changes are temporary.</p>`;
  modal.hidden=false;document.getElementById('task-status').focus();
}
function closeTask(){document.getElementById('task-modal').hidden=true;}
function csvCell(value){return `"${String(value).replaceAll('"','""')}"`;}
function downloadCsv(filename,rows){
  const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast('CSV downloaded');
}
document.addEventListener('click',event=>{
  const viewButton=event.target.closest('[data-view]');if(viewButton){navigate(viewButton.dataset.view);return;}
  const taskButton=event.target.closest('[data-task]');if(taskButton){openTask(taskButton.dataset.task);return;}
  if(event.target.closest('#modal-close')||event.target.id==='task-modal'){closeTask();return;}
  if(event.target.closest('#notification-button')){showToast('You are all caught up.');return;}
  if(event.target.closest('#export-backlog')){downloadCsv('sprintwise-backlog.csv',[['WBS ID','Work item','Priority','Status','Owner','Story points'],...allTasks.map(t=>[t.id,t.title,t.priority,t.status,t.owner,t.points])]);return;}
  if(event.target.closest('#export-summary')){downloadCsv('sprintwise-sprint-02-summary.csv',[['Metric','Value'],['Committed story points',totalPoints()],['Completed story points',completedPoints()],['Remaining story points',totalPoints()-completedPoints()],['Completed tasks',sprintTasks.filter(t=>t.status==='Done').length],['Sprint tasks',sprintTasks.length]]);}
});
document.addEventListener('input',event=>{if(event.target.id==='backlog-search')backlogRows();});
document.addEventListener('change',event=>{
  if(event.target.id==='backlog-filter')backlogRows();
  if(event.target.id==='task-status'){
    const task=allTasks.find(item=>item.id===event.target.dataset.id);if(!task)return;
    if(event.target.value==='In Progress'&&sprintTasks.filter(item=>item.status==='In Progress'&&item!==task).length>=3){event.target.value=task.status;showToast('In Progress has reached its WIP limit of 3.');return;}
    task.status=event.target.value;closeTask();render();showToast(`WBS ${task.id} moved to ${task.status}.`);
  }
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeTask();});
document.getElementById('menu-toggle').addEventListener('click',()=>{const sidebar=document.getElementById('sidebar');sidebar.classList.toggle('open');document.getElementById('menu-toggle').setAttribute('aria-expanded',String(sidebar.classList.contains('open')));});
document.addEventListener('dragstart',event=>{const card=event.target.closest('.kanban-task');if(card){event.dataTransfer.setData('text/plain',card.dataset.task);event.dataTransfer.effectAllowed='move';}});
document.addEventListener('dragover',event=>{const column=event.target.closest('.kanban-col');if(column){event.preventDefault();column.classList.add('drag-over');}});
document.addEventListener('dragleave',event=>{const column=event.target.closest('.kanban-col');if(column&&!column.contains(event.relatedTarget))column.classList.remove('drag-over');});
document.addEventListener('drop',event=>{const column=event.target.closest('.kanban-col');if(!column)return;event.preventDefault();document.querySelectorAll('.kanban-col').forEach(item=>item.classList.remove('drag-over'));const id=event.dataTransfer.getData('text/plain');const task=sprintTasks.find(item=>item.id===id);if(!task||task.status===column.dataset.column)return;if(column.dataset.column==='In Progress'&&sprintTasks.filter(item=>item.status==='In Progress').length>=3){showToast('In Progress has reached its WIP limit of 3.');return;}task.status=column.dataset.column;render();showToast(`WBS ${task.id} moved to ${task.status}.`);});
document.addEventListener('dragend',()=>document.querySelectorAll('.kanban-col').forEach(item=>item.classList.remove('drag-over')));
render();
