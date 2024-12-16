const { User, ImageFile, VideoFile, AudioFile } = require('./videoCreationScriptWithAuth'); // 確保引用正確

// 顯示所有使用者及他們的檔案
async function showAllContent() {
  try {
    const users = await User.findAll();
    users.forEach(user => {
      console.log(`使用者ID: ${user.id}, 使用者名稱: ${user.username}`);
    });

    const latestImages = {};
    const latestAudios = {};
    const latestVideos = {};

    const images = await ImageFile.findAll();
    images.forEach(image => {
      latestImages[image.file_path] = image;
    });

    const audios = await AudioFile.findAll();
    audios.forEach(audio => {
      latestAudios[audio.file_path] = audio;
    });

    const videos = await VideoFile.findAll();
    videos.forEach(video => {
      latestVideos[video.file_path] = video;
    });

    for (const imagePath in latestImages) {
      const image = latestImages[imagePath];
      console.log(`圖片ID: ${image.id}, 檔案路徑: ${image.file_path}, 使用者ID: ${image.user_id}`);
    }

    for (const audioPath in latestAudios) {
      const audio = latestAudios[audioPath];
      console.log(`音訊ID: ${audio.id}, 檔案路徑: ${audio.file_path}, 使用者ID: ${audio.user_id}`);
    }

    for (const videoPath in latestVideos) {
      const video = latestVideos[videoPath];
      console.log(`影片ID: ${video.id}, 檔案路徑: ${video.file_path}, 使用者ID: ${video.user_id}`);
    }
  } catch (error) {
    console.error('顯示所有內容時發生錯誤:', error);
  }
}

// 顯示特定使用者及其檔案內容
async function showSpecificUser(usernameToCheck) {
  try {
    const user = await User.findOne({ where: { username: usernameToCheck } });
    if (user) {
      console.log(`使用者ID: ${user.id}, 使用者名稱: ${user.username}`);

      const latestImages = {};
      const latestAudios = {};
      const latestVideos = {};

      const images = await ImageFile.findAll({ where: { user_id: user.id } });
      images.forEach(image => {
        latestImages[image.file_path] = image;
      });

      const audios = await AudioFile.findAll({ where: { user_id: user.id } });
      audios.forEach(audio => {
        latestAudios[audio.file_path] = audio;
      });

      const videos = await VideoFile.findAll({ where: { user_id: user.id } });
      videos.forEach(video => {
        latestVideos[video.file_path] = video;
      });

      for (const imagePath in latestImages) {
        const image = latestImages[imagePath];
        console.log(`圖片ID: ${image.id}, 檔案路徑: ${image.file_path}, 使用者ID: ${image.user_id}`);
      }

      for (const audioPath in latestAudios) {
        const audio = latestAudios[audioPath];
        console.log(`音訊ID: ${audio.id}, 檔案路徑: ${audio.file_path}, 使用者ID: ${audio.user_id}`);
      }

      for (const videoPath in latestVideos) {
        const video = latestVideos[videoPath];
        console.log(`影片ID: ${video.id}, 檔案路徑: ${video.file_path}, 使用者ID: ${video.user_id}`);
      }
    } else {
      console.log(`找不到使用者名稱為 ${usernameToCheck} 的使用者`);
    }
  } catch (error) {
    console.error('顯示特定使用者內容時發生錯誤:', error);
  }
}

// 範例使用：
const usernameToCheck = 'ting';  // 替換為你要查詢的使用者名稱
showSpecificUser(usernameToCheck);
// showAllContent();  // 呼叫此函數以顯示所有內容

module.exports = {
  showAllContent,
  showSpecificUser,
};
