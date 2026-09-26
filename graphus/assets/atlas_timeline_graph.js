import {timelineView,TIMELINE_KINDS,TIMELINE_LIMITS,TimelineError} from './atlas_timeline.js';

export const TIMELINE_GRAPH_VERSION='graphus-atlas-timeline-graph-1.0.0';
export const TIMELINE_GRAPH_LIMITS=Object.freeze({connections_per_page:8,events_per_page:10});
const check=(ok,code)=>{if(!ok)throw new TimelineError(code);};
const order=(a,b)=>a<b?-1:a>b?1:0;
export const connectionKey=event=>JSON.stringify([event.from,event.to,event.kind]);
const referenceKind=id=>id.split(':')[1];
// This is a view over a verified timeline. It never reconstructs transfers,
// joins assets, or changes the retained calculation and its report hash.
export function timelineGraph(report,selection={},input={}){
  check(Array.isArray(report?.events)&&report.events.length<=TIMELINE_LIMITS.records,'timeline_graph_capacity');
  check(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(key=>['reference','direction','kind'].includes(key)),'invalid_timeline_graph_filters');
  const filters={reference:input.reference??null,direction:input.direction??'all',kind:input.kind??'all'};
  const known=new Set(report.events.flatMap(event=>[event.from,event.to]));
  check(known.size<=TIMELINE_LIMITS.nodes,'timeline_graph_capacity');
  check(filters.reference===null||typeof filters.reference==='string'&&known.has(filters.reference),'timeline_graph_reference_unobserved');
  check(['all','incoming','outgoing','self'].includes(filters.direction)&&(filters.direction==='all'||filters.reference!==null),'timeline_graph_direction_requires_reference');
  check(filters.kind==='all'||TIMELINE_KINDS[report.asset]?.includes(filters.kind),'invalid_timeline_graph_kind');
  const base=timelineView(report,selection),references=[...new Set(base.events.flatMap(event=>[event.from,event.to]))].sort(order);
  const events=base.events.filter(event=>{
    if(filters.kind!=='all'&&event.kind!==filters.kind)return false;
    if(filters.reference===null)return true;
    if(event.from!==filters.reference&&event.to!==filters.reference)return false;
    const direction=event.from===filters.reference&&event.to===filters.reference?'self':event.to===filters.reference?'incoming':'outgoing';
    return filters.direction==='all'||filters.direction===direction;
  });
  const groups=new Map(),nodes=new Map();
  for(const event of events){
    const key=connectionKey(event);
    if(!groups.has(key))groups.set(key,{key,from:event.from,to:event.to,kind:event.kind,events:0,total:0n,event_ids:[],first_observed:event.block_time,last_observed:event.block_time});
    const group=groups.get(key);group.events++;group.total+=BigInt(event.amount_base_units);group.event_ids.push(event.event_id);group.last_observed=event.block_time;
    for(const id of new Set([event.from,event.to])){
      if(!nodes.has(id))nodes.set(id,{id,kind:referenceKind(id),events:0,incoming:0,outgoing:0,self:0,neighbors:new Set()});
      const node=nodes.get(id);node.events++;node[event.from===id&&event.to===id?'self':event.to===id?'incoming':'outgoing']++;
      const other=event.from===id?event.to:event.from;if(other!==id)node.neighbors.add(other);
    }
  }
  const connections=[...groups.values()].sort((a,b)=>order(a.from,b.from)||order(a.to,b.to)||order(a.kind,b.kind)).map(({total,...group})=>({...group,observed_total_base_units:total.toString()}));
  return {version:TIMELINE_GRAPH_VERSION,selection:base.selection,filters,references,events,connections,
    nodes:[...nodes.values()].sort((a,b)=>order(a.id,b.id)).map(({neighbors,...node})=>({...node,adjacent_references:neighbors.size})),
    summary:{selected_timeline_events:base.events.length,matching_events:events.length,connections:connections.length,references:nodes.size,complete_history:false}};
}
export function timelineGraphCsv(report,selection={},filters={},connection=null){
  const graph=timelineGraph(report,selection,filters);
  check(connection===null||typeof connection==='string'&&graph.connections.some(group=>group.key===connection),'timeline_graph_connection_unobserved');
  const rows=connection===null?graph.events:graph.events.filter(event=>connectionKey(event)===connection);
  const headers=['graph_view_version','timeline_report_sha256','dataset_sha256','asset','unit','selected_start_utc','selected_end_utc_inclusive','event_search','graph_reference','graph_direction','graph_event_kind','selected_connection','event_id','block_time','kind','from','to','amount_base_units','transaction_id','position','block_height','block_hash'];
  const csv=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
  return [headers,...rows.map(event=>[graph.version,report.report_sha256,report.provenance.dataset_sha256,report.asset,report.unit,graph.selection.start,graph.selection.end_inclusive,graph.selection.event_search,graph.filters.reference,graph.filters.direction,graph.filters.kind,connection,event.event_id,event.block_time,event.kind,event.from,event.to,event.amount_base_units,event.txid,event.position,event.block_number,event.block_hash])].map(row=>row.map(csv).join(',')).join('\r\n');
}
