const fs = require('fs');
const config = require('config');
const OoyalaAPI = require('ooyala-api');
const throughParallel = require('through2-parallel');
const curlDownload = require('node-curl-download');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const debug = require('debug');

const CONCURRENT_DOWNLOAD_NUM = 5;
const api = new OoyalaAPI(config.api.key, config.api.secret, {concurrency: CONCURRENT_DOWNLOAD_NUM});
const Download = curlDownload.Download;
const ASSET_DIR = `${__dirname}/assets`;
const print = debug('m2p');

function isMPEG2PS(fileName) {
  if (typeof fileName !== 'string') {
    return false;
  }
  return fileName.lastIndexOf('.m2p') !== -1;
}

function toNumber(str) {
  if (typeof str === 'number') {
    return str;
  }
  const num = parseInt(str, 10);
  if (isNaN(num)) {
    return 0;
  }
  return num;
}

function strip(obj) {
  const streams = obj.streams;
  if (!streams || streams.length === undefined || streams.length === 0) {
    return null;
  }
  const info = {
    video_start_time: 0,
    audio_start_time: 0
  };
  streams.forEach(stream => {
    let timeBase = eval(stream.codec_time_base || stream.time_base);
    if (typeof timeBase !== 'number') {
      timeBase = 1;
    }
    if (stream.codec_type === 'video' && stream.start_time !== undefined) {
      info.video_start_time = `${toNumber(stream.start_time) * timeBase * 1000} ms`;
    } else if (stream.codec_type === 'audio' && stream.start_time !== undefined) {
      info.audio_start_time = `${toNumber(stream.start_time) * timeBase * 1000} ms`;
    }
  });
  return info;
}

function createStream(concurrency, transformFunction, flushFunction) {
  return throughParallel.obj({concurrency}, transformFunction, flushFunction);
}

class DLStream {
  constructor(concurrency) {
    this.stream = createStream(concurrency, (obj, enc, cb) => {
      const [url, path] = obj.params;
      const dl = new Download(url, path);

      dl.on('progress', progress => {
        print(`Download: [${path}] ${progress} %`);
      });

      dl.on('end', code => {
        if (code === 0) {
          print(`Download: [${path}] finished.`);
          obj.resolve(path);
          cb();
        } else {
          print(`Download: [${path}] failed.`);
          obj.reject(new Error(`Download: [${path}] failed. error-code=${code}`));
          cb();
        }
        return;
      });

      print(`Download: [${path}] started. url=${url}`);
      dl.start();
    });
  }

  add(params, resolve, reject) {
    this.stream.write({params, resolve, reject});
  }
}

api.get('/v2/assets', {where: `asset_type='video'+AND+status='live'`}, {recursive: true})
.then(results => {
  const m2ps = results.filter(result => isMPEG2PS(result.original_file_name));
  print(`${m2ps.length} MPEG2 PS source files found.`);
  return Promise.all(
    m2ps.map(result => {
      return api.get(`/v2/assets/${result.embed_code}/source_file_info`);
    })
  );
})
.then(results => {
  if (!fs.existsSync(ASSET_DIR)) {
    fs.mkdirSync(ASSET_DIR);
  }
  const dlStream = new DLStream(CONCURRENT_DOWNLOAD_NUM);
  return Promise.all(
    results.map(result => {
      return new Promise((resolve, reject) => {
        dlStream.add([result.source_file_url, `${ASSET_DIR}/${result.original_file_name}`], resolve, reject);
      })
      .then(path => {
        return ffprobe(path, {path: ffprobeStatic.path})
        .then(data => {
          console.log(`[${path}] ${data.streams.length} streams found`);
          return strip(data);
        });
      })
      .then(json => {
        try {
          console.log(JSON.stringify(json));
        } catch (err) {
          console.log(json);
        }
      })
      .catch(err => {
        console.error(err.stack);
      });
    })
  );
})
.then(() => {
  console.log(`Done`);
});
