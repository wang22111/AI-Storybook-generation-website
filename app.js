// app.js
import express from 'express';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import axios from 'axios';
import { Translator } from 'google-translate-api-x';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import flash from 'connect-flash';
import { Sequelize, DataTypes } from 'sequelize';
import gtts from 'gtts';
import fetch from 'node-fetch';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';
import { fileURLToPath } from 'url';  // ES模組中用來處理路徑
import { dirname } from 'path';
import cookieParser from 'cookie-parser';
import MP4Box from 'mp4box';
// 將 `import.meta.url` 轉換為檔案路徑
const __filename = fileURLToPath(import.meta.url);
// 獲取當前模組的目錄名
const __dirname = dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

global.fetch = fetch;

const app = express();

dotenv.config();

// 設定 OpenAI API 金鑰
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

console.log(process.env.OPENAI_API_KEY);
// 設定 Sequelize 資料庫
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'users.db',
});

// 定義模型
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(150),
    unique: true,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
});

const ImageFile = sequelize.define('ImageFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  file_path: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  script: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

});

const AudioFile = sequelize.define('AudioFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  file_path: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
});
const SubtitleFile = sequelize.define('SubtitleFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  file_path: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
});
const VideoFile = sequelize.define('VideoFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  file_path: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
});

User.hasMany(ImageFile, { foreignKey: 'user_id' });
User.hasMany(AudioFile, { foreignKey: 'user_id' });
User.hasMany(VideoFile, { foreignKey: 'user_id' });
User.hasMany(SubtitleFile, { foreignKey: 'user_id' }); // 每個使用者可以有多個字幕文件

let progress = { message: '', progress: 0 };
let cancelFlag = false;

function updateProgress(message, progressValue) {
  progress.message = message;
  progress.progress = progressValue;
}

function nocache(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '-1');
  next();
}

// 中介軟體
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 指定靜態資源目錄
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(cookieParser());
app.use(flash());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));
// 設定視圖引擎為 EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // 設定 EJS 檔案的目錄
app.use((req, res, next) => {
  if (req.session.user) {
    User.findByPk(req.session.user.id)
      .then((user) => {
        req.user = user;
        next();
      })
      .catch((err) => {
        console.error(err);
        next();
      });
  } else {
    next();
  }
});

function loginUser(req, user) {
  req.session.user = {
    ...user.dataValues,  // 將使用者資料存入 session
    is_authenticated: true  // 設置 isAuthenticated 為 true
  }; // 使用 user.dataValues 確保儲存使用者的資料
}

sequelize.sync().then(() => {
  app.listen(process.env.PORT || 5000, () => {
    console.log(`伺服器正在運行於端口 ${process.env.PORT || 5000}`);
  });
});

app.get('/', (req, res) => {
  res.render('index', { current_user: req.session.user });
});

app.get('/login', (req, res) => {
  res.render('login', {
    current_user: req.session.user || null, // 如果使用者已經登錄，則傳遞 user 信息
    messages: req.flash('danger')   // 傳遞 Flash 訊息，可能會顯示登錄失敗等錯誤
  });
});

app.get('/register', (req, res) => {
  res.render('register', { messages: req.flash('danger'), current_user: req.session.user });
});

// 函數
app.post('/login', async function login(req, res) {
  const { username, password } = req.body;

  try {
    // 在資料庫中查找使用者
    const user = await User.findOne({ where: { username: username } });

    if (user && user.password === password) {
      // 假設有一個 loginUser 函數來處理使用者登錄
      loginUser(req, user);
      return res.redirect('/my_images');
    } else {
      // 登錄失敗，設置 flash 消息
      req.flash('danger', '登錄失敗。請檢查使用者名稱和密碼');
      return res.redirect('/login');
    }
  } catch (error) {
    console.error('登錄錯誤:', error);
    res.status(500).send('內部伺服器錯誤');
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 在資料庫當中是否有相同使用者的名稱
    const existingUser = await User.findOne({ where: { username: username } });

    if (existingUser) {
      // 如果使用者名稱已存在，設置 flash 消息
      req.flash('danger', '使用者已存在。請選擇不同的使用者名稱。');
      return res.redirect('/register');
    }

    // 創建新使用者
    const newUser = await User.create({ username: username, password: password });
    await newUser.save();

    // 登錄新使用者
    loginUser(req, newUser);
    return res.redirect('/my_images');
  } catch (error) {
    console.error('註冊錯誤:', error);
    res.status(500).send('內部伺服器錯誤');
  }
});

function login_required(req, res, next) {
  console.log(req.session.user);
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

// 登出路由
app.get('/logout', login_required, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('內部伺服器錯誤');
    }
    return res.redirect('/');
  });
});

////

app.get('/generate_video_progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 初始化訊息
  progress.message = '影片產生開始囉';
  res.write(`data: ${JSON.stringify(progress)}\n\n`);

  const sendProgress = setInterval(() => {
    // 每次發送前更新進度訊息
    progress.message = `目前進度: ${progress.progress}%`;

    // 推送目前進度
    res.write(`data: ${JSON.stringify(progress)}\n\n`);

    // 檢查是否達到結束條件
    if (progress.progress >= 100 || cancelFlag) {
      if (cancelFlag) {
        progress.message = '影片產生已取消';
      } else {
        progress.message = '影片產生完成！';
      }

      // 發送最終狀態並結束連線
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      clearInterval(sendProgress);
      res.end();
    }
  }, 1000);

  // 當客戶端關閉連線時，停止發送進度
  req.on('close', () => {
    clearInterval(sendProgress);
  });
});

// 處理取消產生請求
app.post('/cancel_generation', (req, res) => {
  cancelFlag = true;
  res.json({ message: '影片產生已取消。' });
});

async function generate_script_and_scene(prompt, scriptFilePath = 'generated_script.txt') {
  console.log("腳本與場景描述生成中...");
  updateProgress("腳本與場景描述生成中...", 10);

  try {
    console.log('提示詞:', prompt);
    console.log('發送請求到 OpenAI API...');
    // 呼叫 OpenAI API 生成腳本與場景描述
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "你是一位優秀的故事講述者，請用繁體中文。" },
        { role: "user", content: prompt }
      ]
    });

    const scriptAndScene = response.choices[0].message.content.trim();

    updateProgress("腳本與場景描述完成。", 20);
    console.log("腳本與場景描述完成。");

    // 將生成的內容寫入檔案
    fs.writeFileSync(scriptFilePath, scriptAndScene, { encoding: 'utf-8' });

    return scriptAndScene;
  } catch (error) {
    console.error("生成腳本與場景時出錯:", error);
    throw error; // 重新拋出錯誤供呼叫者處理
  }
}

async function generate_image(prompt, style, retries = 5) {
  for (let i = 0; i < retries; i++) {
    if (cancelFlag) {
      throw new Error('產生已取消');
    }
    try {
      const styled_prompt = style + " style: " + prompt
      console.log(styled_prompt)
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: styled_prompt,
        n: 1,
        size: "1024x1024",
      });

      console.log('OpenAI 回應:', response); // 偵錯輸出

      if (!response.data || !response.data.length) {
        throw new Error('回應中沒有資料');
      }

      const imageUrl = response.data[0].url;
      if (!imageUrl) {
        throw new Error('資料中無法取得 URL');
      }

      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data);

      console.log('圖片產生完成。');
      return imageBuffer; // 回傳 Buffer 物件
    } catch (error) {
      console.error('生成圖片時出錯:', error);
      if (i < retries - 1) {
        console.log('重新嘗試中...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒後再重試
      } else {
        throw error;
      }
    }
  }
}

async function generate_images(userId, style, sceneDescriptions, imageFolder) {
  const userImageFolder = path.join(imageFolder, userId.toString()); // 透過 req.session.user 取得使用者ID

  if (!fs.existsSync(userImageFolder)) {
    fs.mkdirSync(userImageFolder, { recursive: true });
  }

  // 刪除資料庫和資料夾中的舊圖片
  const oldImages = await ImageFile.findAll({ where: { user_id: userId } });

  for (const oldImage of oldImages) {
    if (fs.existsSync(oldImage.file_path)) {
      fs.unlinkSync(oldImage.file_path);
    }
    await oldImage.destroy();
  }

  let images = [];
  const totalScenes = sceneDescriptions.length;

  for (let idx = 0; idx < totalScenes; idx++) {
    if (cancelFlag) {
      throw new Error("產生已取消");
    }

    const description = sceneDescriptions[idx];

    if (description) {
      console.log(`正在產生第 ${idx + 1} 張場景圖片: ${description}`);
      updateProgress(`正在產生第 ${idx + 1} 張圖片，共 ${totalScenes} 張...`, 20 + Math.floor(idx / totalScenes * 40));

      try {
        const image = await generate_image(description, style);
        if (!image) {
          throw new Error("產生的圖片為 null");
        }

        const imagePath = path.join(userImageFolder, `image_${idx + 1}.jpg`);
        console.log(`圖片已儲存於: ${imagePath}`);

        fs.writeFileSync(imagePath, image); // 儲存圖片資料到檔案

        // 儲存圖片路徑和腳本到資料庫
        await ImageFile.create({
          file_path: imagePath,
          user_id: userId,
          script: description
        });

        images.push(imagePath);
      } catch (error) {
        console.error(`產生或儲存圖片時出錯: ${error.message}`);
        throw error;
      }
    }
  }

  updateProgress("所有圖片已產生完成。", 60);
  console.log(`所有圖片已產生。總數: ${images.length}`);

  return images;
}


async function translateAndGenerateAudio(userId, script, audioFolder, fileName = 'output.aac') {
  try {
    updateProgress("正在將腳本翻譯成中文並生成音頻...", 60);

    // 刪除舊的音頻文件
    const oldAudios = await AudioFile.findAll({ where: { user_id: userId } });
    for (const oldAudio of oldAudios) {
      if (fs.existsSync(oldAudio.file_path)) {
        fs.unlinkSync(oldAudio.file_path);
      }
      await oldAudio.destroy();
    }

    // const translate = new Translator();
    const userAudioFolder = path.join(audioFolder, userId.toString());
    if (!fs.existsSync(userAudioFolder)) {
      fs.mkdirSync(userAudioFolder, { recursive: true });
    }

    // 將翻譯後的文本按照標點符號拆分為句子
    const sentenceDelimiters = /(?<=[，。！？])/; // 正則表達式，根據句號、驚嘆號、問號進行拆分
    const translatedScenes = [];
    let segmentIndex = 0;

    // 用於記錄每個句子所屬的場景索引
    const sentenceSceneMapping = [];

    // 用於收集所有音頻片段的路徑
    const audioSegments = [];

    // 將翻譯後的文本按照場景進行拆分
    const translatedSceneTexts = script.split('\n');
    //console.log("translatedSceneTexts.length: " + translatedSceneTexts.length)

    for (let sceneIndex = 0; sceneIndex < translatedSceneTexts.length; sceneIndex+=2) {
      const sceneText = translatedSceneTexts[sceneIndex];
      //console.log("sceneText: "+sceneText);
      // 根據標點符號拆分場景文本為句子
      const sentences = sceneText.split(sentenceDelimiters).filter(sentence => sentence.trim());
      translatedScenes.push(sentences);

      // // 記錄每個句子的場景索引
      // sentences.forEach(() => {
      //   sentenceSceneMapping.push(sceneIndex);
      // });

      // 為場景中的每個句子生成音頻
      for (let s = 0; s < sentences.length; s++) {
        const sentence = sentences[s];

        // 為句子生成音頻
        const tempAudioPath = path.join(userAudioFolder, `temp_segment_${segmentIndex}.mp3`);
        await new Promise((resolve, reject) => {
          const gttsInstance = new gtts(sentence, 'zh');
          gttsInstance.save(tempAudioPath, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        // 轉換為 AAC 格式
        const audioPath = path.join(userAudioFolder, `segment_${segmentIndex}.aac`);
        await new Promise((resolve, reject) => {
          ffmpeg(tempAudioPath)
            .audioCodec('aac')
            .audioBitrate('128k')
            .output(audioPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
        });

        // 刪除臨時音頻文件
        fs.unlinkSync(tempAudioPath);

        // 獲取音頻片段的時長
        const duration = await getAudioDuration(audioPath);

        // 將音頻文件信息保存到資料庫
        await AudioFile.create({
          file_path: audioPath,
          user_id: userId,
          segment_index: segmentIndex,
          scene_index: sceneIndex / 2,
          duration: duration
        });

        // 將音頻文件路徑添加到 audioSegments 數組中
        audioSegments.push({
          path: audioPath,
          sceneIndex: sceneIndex / 2,
          segmentIndex: segmentIndex
        });
        console.log("推送音頻片段: 路徑: " + audioPath + " 場景索引: " + sceneIndex / 2 + " 片段索引: " + segmentIndex);
        segmentIndex++;
      }
    }

    updateProgress("中文音頻已生成。", 70);
    return { audioFolder: userAudioFolder, translatedScenes, audioSegments };
  } catch (error) {
    console.error(`翻譯並生成音頻時出錯：${error}`);
    throw error;
  }
};

function calculate_scene_lengths(scene_descriptions) {
  const lengths = scene_descriptions.map(desc => desc.length);
  const totalLength = lengths.reduce((acc, len) => acc + len, 0);
  return { lengths, totalLength };
}

async function generateSubtitles(userId, translatedScenes, videoFolder, srtFilePath) {
  const userVideoFolder = videoFolder;
  const srtFolder = path.dirname(srtFilePath);

  // 確保字幕資料夾存在
  if (!fs.existsSync(srtFolder)) {
    fs.mkdirSync(srtFolder, { recursive: true });
  }

  let srtContent = '';
  let cumulativeTime = 0;
  let segmentCounter = 1;
  let segmentIndex = 0;
  const additionalInterval = 0.0426; 
  for (let sceneIndex = 0; sceneIndex < translatedScenes.length; sceneIndex++) {
    const sentences = translatedScenes[sceneIndex];

    for (let s = 0; s < sentences.length; s++) {
      const sentenceText = sentences[s].replace(/[，。！？]/g, '');

      // 獲取音頻片段的時長
      const videoPath = path.join(userVideoFolder, `output${segmentIndex + 1}.mp4`);
      const duration = await getVideoDuration(videoPath);
      const startTime = cumulativeTime;
      const endTime = cumulativeTime + duration;

      const startTimeFormatted = formatTime(startTime);
      const endTimeFormatted = formatTime(endTime);

      srtContent += `${segmentCounter}\n`;
      srtContent += `${startTimeFormatted} --> ${endTimeFormatted}\n`;
      srtContent += `${sentenceText}\n\n`;

      cumulativeTime = endTime + additionalInterval;
      segmentCounter++;
      segmentIndex++;
    }
  }

  // 寫入 .srt 文件
  fs.writeFileSync(srtFilePath, srtContent, { encoding: 'utf-8' });

  // 將字幕文件路徑保存到資料庫
  await SubtitleFile.create({
    file_path: srtFilePath,
    user_id: userId
  });

  updateProgress("字幕生成完成。", 90);
}


////

async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, function(err, metadata) {
      if (err) {
        reject(err);
      } else {
        let duration = 0;
        if (metadata.format && metadata.format.duration) {
          duration = parseFloat(metadata.format.duration);
        } else if (metadata.streams && metadata.streams.length > 0) {
          for (const stream of metadata.streams) {
            if (stream.duration) {
              duration = Math.max(duration, parseFloat(stream.duration));
            }
          }
        } else {
          return reject(new Error('無法獲取音頻時長'));
        }
        resolve(duration);
      }
    });
  });
}
async function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, function(err, metadata) {
      if (err) {
        reject(err);
      } else {
        let duration = 0;
        if (metadata.format && metadata.format.duration) {
          duration = parseFloat(metadata.format.duration);
        } else if (metadata.streams && metadata.streams.length > 0) {
          for (const stream of metadata.streams) {
            if (stream.duration) {
              duration = Math.max(duration, parseFloat(stream.duration));
            }
          }
        } else {
          return reject(new Error('無法獲取影片時長'));
        }
        resolve(duration);
      }
    });
  });
}
function formatTime(seconds) {
  const totalMilliseconds = Math.round(seconds * 1000);

  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const secs = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  const hoursString = String(hours).padStart(2, '0');
  const minutesString = String(minutes).padStart(2, '0');
  const secondsString = String(secs).padStart(2, '0');
  const millisecondsString = String(milliseconds).padStart(3, '0');

  return `${hoursString}:${minutesString}:${secondsString},${millisecondsString}`;
}

async function createAudioSegment(inputFile, startTime, endTime, outputFile) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .audioFilters([
        'afade=t=in:st=0:d=0.5',
        `afade=t=out:st=${endTime - startTime - 0.5}:d=0.5`
      ])
      .output(outputFile)
      // .on('stderr', (stderrLine) => {
      //   console.log('FFmpeg stderr output:', stderrLine);
      // })
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}


async function concatenateWithFfmpeg(outputVideos, outputFilePath) {
  const inputFileList = path.join(path.dirname(outputFilePath), 'input.txt');

  fs.writeFileSync(inputFileList, outputVideos.map(file => `file '${file}'`).join('\n'));

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputFileList)
      .inputOptions('-f concat')
      .inputOptions('-safe 0')
      // .outputOptions('-c copy') // 不進行重新編碼
      .videoCodec('libx264') // 使用 H.264 重新編碼
      .audioCodec('aac') // 使用 AAC 重新編碼音频
      .outputOptions('-fflags +genpts')
      // .outputOptions('-strict experimental')
      // // .audioBitrate('128k')               // 設置音頻比特率
      .outputOptions('-shortest')         // 停止編碼當最短流結束
      // .outputOptions('-max_muxing_queue_size 1024') // 增加緩衝區大小
      .output(outputFilePath)
      // .on('stderr', (stderrLine) => {
      //   console.log('FFmpeg stderr output:', stderrLine);
      // })
      .on('end', () => {
        console.log('All videos merged successfully.');
        resolve(outputFilePath);  // 成功後返回影片的路徑
      })
      .on('error', (err) => {
        console.error('Error merging videos:', err.message);
        reject(err);
      })
      .run();
  });
}



async function create_video(userId, images, translatedScenes,audioSegments, videoFolder, outputFile = 'story.mp4') {
  const userVideoFolder = path.join(videoFolder, userId.toString());

  if (!fs.existsSync(userVideoFolder)) {
    fs.mkdirSync(userVideoFolder, { recursive: true });
  }

  const oldVideos = await VideoFile.findAll({ where: { user_id: userId } });
  for (const oldVideo of oldVideos) {
    if (fs.existsSync(oldVideo.file_path)) {
      fs.unlinkSync(oldVideo.file_path);
    }
    await oldVideo.destroy();
  }

  updateProgress("Creating video...", 90);
  console.log("Creating video...");



  const outputVideos = [];

  for (let i = 0; i < audioSegments.length; i++) {
    const audioSegment = audioSegments[i];
    const sceneIndex = audioSegment.sceneIndex;
    const image = images[sceneIndex]; // 確保 images 數組與 sceneIndex 對應
    const outputVideoPath = path.join(userVideoFolder, `output${i + 1}.mp4`);
    const audioDuration = await getAudioDuration(audioSegment.path);  // 獲取音頻時長
    await new Promise((resolve, reject) => {
      ffmpeg()
        .addInput(image)
        .inputOptions(['-loop 1', `-t ${audioDuration}`])  // 設置圖片持續時間
        .addInput(audioSegment.path)
        .outputOptions('-c:v libx264')
        //.outputOptions('-c:a aac')
        .outputOptions('-c:a aac')
        .outputOptions('-strict experimental')
        .outputOptions('-shortest')
        .output(outputVideoPath)
        // .on('stderr', (stderrLine) => {
        //   console.log('FFmpeg stderr output:', stderrLine);
        // })
        .on('end', () => {
          console.log(`Generated video segment: ${outputVideoPath}`);
          outputVideos.push(outputVideoPath);
          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  ///
  const finalOutputVideoPath = path.join(userVideoFolder, outputFile);

  // 從資料庫獲取字幕文件
  await generateSubtitles(userId, translatedScenes, userVideoFolder, 'subtitles/generated_subtitles.srt');
  let subtitleFile = await SubtitleFile.findOne({ where: { user_id: userId } });

  await concatenateWithFfmpeg(outputVideos, finalOutputVideoPath);
  //console.log(await getVideoDuration(finalOutputVideoPath));
  if (subtitleFile) {
    subtitleFile = fs.readFileSync('subtitles/generated_subtitles.srt', 'utf8');
    const tempOutputPath = path.join(path.dirname(finalOutputVideoPath), 'temp_' + path.basename(finalOutputVideoPath));
    
    let subtitlesPath = path.resolve(__dirname, 'subtitles', 'generated_subtitles.srt');  // 確保生成正確的絕對路徑
    subtitlesPath = subtitlesPath.replace(/^([A-Z]:)/i, '');
    subtitlesPath = subtitlesPath.replace(/\\/g, '\\/');
    subtitlesPath="'"+subtitlesPath+"'";
    await new Promise((resolve, reject) => {
      ffmpeg(finalOutputVideoPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions('-vf subtitles=' + subtitlesPath)  // 確保路徑使用正斜杠
        .outputOptions('-max_muxing_queue_size 9999') // 增大緩衝區
        .output(tempOutputPath) // 輸出到臨時檔案
        // .on('stderr', (stderrLine) => {
        //   console.log('FFmpeg stderr output:', stderrLine);
        // })
        .on('end', function () {
          console.log('字幕已成功加到影片中！');

          // 將臨時檔案重新命名為原始檔案
          fs.renameSync(tempOutputPath, finalOutputVideoPath);

          resolve();
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }
  updateProgress("Video created.", 100);
  console.log("Video created.");
  return finalOutputVideoPath;
}


app.post('/generate_video', login_required, nocache, async (req, res) => {
  const { prompt, style } = req.body;
  console.log('prompt: ', prompt);
  console.log('style:', style);
  // 認證使用者
  const userId = req.session.user.id; // 假設 req.user 儲存當前使用者

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  progress = { message: 'Starting video generation...', 'progress': 0 };
  cancelFlag = false;

  console.log(`Current user: ${userId}`);

  const process = async () => {
    try {
      // 生成腳本與場景描述
      const scriptFilePath = 'generated_script.txt';
      const scriptAndScene = await generate_script_and_scene(prompt, scriptFilePath);
      const sceneDescriptions = scriptAndScene.split('\n').filter(desc => desc.trim());

      // 生成圖片
      const imageFolder = 'images';
      const images = await generate_images(userId, style, sceneDescriptions, imageFolder);

      // 翻譯並生成中文音頻
      const { audioFolder, translatedScenes, audioSegments } = await translateAndGenerateAudio(userId, scriptAndScene, 'audio');
      //await generateSubtitles(userId, translatedScenes, audioFolder, 'subtitles/generated_subtitles.srt');
      //const translatedDescriptions =translatedScript.split('\n').filter(desc => desc.trim());

      // 將音頻切成分段
      //const audioSegments = await splitAudio(userId, audioFile, translatedDescriptions, audioFolder, 'subtitles/generated_subtitles.srt');
      // 按場景分組音頻片段


      // 創建影片
      const videoFolder = 'video';
      const outputVideoPath = await create_video(userId, images, translatedScenes,audioSegments, videoFolder, 'story.mp4', 'subtitles/generated_subtitles.srt');

      // 保存影片到資料庫
      await VideoFile.create({
        file_path: outputVideoPath,
        user_id: userId
      });

      updateProgress('Video generation complete.', 100);
      return outputVideoPath;
    } catch (e) {
      updateProgress(`Error: ${e.message}`, 100);
      console.error(e);
      throw e;
    }
  };

  // 使用非同步函式來處理長時間運行的任務
try {
  const videoPath = await process();
  res.json({ message: '影片生成已開始！', videoPath });
} catch (error) {
  res.status(500).json({ message: `錯誤發生了：${error.message}` });
}
});

app.get('/images/:user_id/:filename', login_required, (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const filename = req.params.filename;

  // 檢查使用者是否有權限瀏覽圖片
  if (userId !== req.session.user.id) {
    return res.status(403).send('你沒這權限喔！');
  }

  const userImageFolder = path.join('images', userId.toString());

  // 發送圖片檔案
  const filePath = path.join(userImageFolder, filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath, { root: '.' });
  } else {
    res.status(404).send('檔案找不到啦～');
  }
});

app.get('/my_images', login_required, nocache, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userImages = await ImageFile.findAll({ where: { user_id: userId } });
    console.log(userImages);
    // 替換 file_path 中的反斜線為正斜線
    const formattedImages = userImages.map(image => {
      return {
        ...image.dataValues,
        file_path: image.file_path.replace(/\\/g, '/')  // 讓 Windows 檔案路徑變成正斜線
      };
    });
    // 把圖片路徑列表傳給模板引擎
    res.render('my_images', { images: formattedImages, current_user: req.session.user });
  } catch (error) {
    console.error(error);
    res.status(500).send('系統忙線中，請稍後再試～');
  }
});

// 影片檔案的處理
app.get('/video/:user_id/:filename', login_required, (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const filename = req.params.filename;

  // 檢查使用者是否有權限觀看影片
  if (userId !== req.session.user.id) {
    return res.status(403).send('沒這權限，別亂進啦～');
  }

  const userVideoFolder = path.join('video', userId.toString());

  // 發送影片檔案
  const filePath = path.join(userVideoFolder, filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath, { root: '.' });
  } else {
    res.status(404).send('檔案不見了ㄟ～');
  }
});

app.get('/my_video', login_required, nocache, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userVideos = await VideoFile.findAll({ where: { user_id: userId } });
    console.log(userVideos);
    // 把影片路徑列表傳給模板引擎
    res.render('my_videos', { videos: userVideos.map(video => video.file_path), current_user: req.session.user });
  } catch (error) {
    console.error(error);
    res.status(500).send('喔不，系統發生問題了！');
  }
});

// 生成頁面
app.get('/generate', login_required, nocache, (req, res) => {
  res.render('generate', { current_user: req.session.user });
});

// 生成頁面 2
app.get('/generate2', (req, res) => {
  res.render('generate2', { current_user: req.session.user });
});

// 文字輸入框頁面
app.get('/textbox', (req, res) => {
  res.render('textbox', { current_user: req.session.user });
});

// 關於頁面
app.get('/about', (req, res) => {
  res.render('about', { current_user: req.session.user });
});
