// New isolated analytics table. The existing four schemas/data are unchanged.
// EDITOR ONLY. Never exposed through dispatch_. Does not create/replace a DB.
function migrateMaterialLibraryV4() {
  return withLock_(function() {
    var id=props_().getProperty('SHEET_ID');
    if(!id)fail_('SETUP_REQUIRED','기존 SHEET_ID 설정을 먼저 확인하세요.');
    var book=SpreadsheetApp.openById(id),schema=KN.schemas.materialViews;
    var sheet=book.getSheetByName(schema.name),created=!sheet;
    if(!sheet)sheet=book.insertSheet(schema.name);
    if(sheet.getLastRow()===0){sheet.getRange(1,1,1,schema.headers.length).setValues([schema.headers]);sheet.setFrozenRows(1);}
    validateHeaders_(databaseContext_(id,book),'materialViews',sheet.getRange(1,1,1,schema.headers.length).getValues()[0]);
    SpreadsheetApp.flush();
    console.log('자료열람이력 검사 완료. 기존 신청/이력/정원/인증 설정은 보존했습니다.');
    return {created:created,sheet:schema.name};
  });
}
