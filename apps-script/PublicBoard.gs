// Anonymous aggregate projection only. No publicRow_/request objects/auth data.
function publicBoard_() {
  // Capture BEFORE the one batch: concurrent writes are detected by the next probe.
  var revision = snapshotRevision_('board'), db = availabilitySnapshot_();
  var times = operatingTimes_(db), counts = Object.create(null);
  rows_(db,'requests').forEach(function(r) {
    if (r.status !== KN.status.confirmed) return;
    var key = r.providerId + '|' + r.time;
    counts[key] = (counts[key] || 0) + 1;
  });
  return {
    times:times,
    providers:KN.providers.map(function(p) {
      var info=provider_(db,p.id,false);
      return {id:p.id,name:info.name,english:info.english,slots:times.map(function(time) {
        var slot=slot_(db,p.id,time), confirmed=counts[p.id+'|'+time] || 0, enabled=active_(info.active) && active_(slot.active);
        return {time:time,capacity:slot.capacity,confirmed:confirmed,
          remaining:enabled ? Math.max(0,slot.capacity-confirmed) : 0,active:enabled};
      })};
    }),
    revision:revision
  };
}
