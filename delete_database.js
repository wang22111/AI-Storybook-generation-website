const fs = require('fs');
const path = require('path');
const { Sequelize, Model, DataTypes } = require('sequelize');
const dotenv = require('dotenv');
const { User, ImageFile, VideoFile, AudioFile } = require('./videoCreationScriptWithAuth'); // 確保引用正確

dotenv.config();

// 刪除資料庫中的檔案紀錄及檔案系統中的檔案
async function deleteEntry(filePath, userId, fileType = 'video') {
  let entry;

  if (fileType === 'image') {
    entry = await ImageFile.findOne({ where: { file_path: filePath, user_id: userId } });
  } else if (fileType === 'audio') {
    entry = await AudioFile.findOne({ where: { file_path: filePath, user_id: userId } });
  } else if (fileType === 'video') {
    entry = await VideoFile.findOne({ where: { file_path: filePath, user_id: userId } });
  } else {
    console.log(`這種檔案類型還不支援喔: ${fileType}`);
    return;
  }

  if (entry) {
    // 從檔案系統刪除檔案
    if (fs.existsSync(entry.file_path)) {
      fs.unlinkSync(entry.file_path);
      console.log(`已刪除檔案：${entry.file_path}`);
    }

    // 從資料庫刪除紀錄
    await entry.destroy();
    console.log(`已從資料庫刪除紀錄：${entry.file_path}`);

    // 驗證是否真的刪除成功
    const remainingEntry = await VideoFile.findOne({ where: { file_path: filePath, user_id: userId } });
    if (remainingEntry) {
      console.log(`哎呀，刪除資料庫紀錄失敗了：${filePath}`);
    } else {
      console.log(`成功從資料庫刪除紀錄：${filePath}`);
    }
  } else {
    console.log(`找不到該 ${fileType} 檔案的紀錄：檔案路徑：${filePath}，使用者ID：${userId}`);
  }
}

// 範例使用：
deleteEntry('video/story.mp4', 1, 'video');

module.exports = {
  deleteEntry,
};
