# m2p-dump
A tool for viewing output from ffprobe command run over OOYALA provider's MPEG2 PS files

## Install
First, install Node.js (version 6+), curl and FFmpeg on your system.
```
$ git clone git@github.com:kuu/m2p-dump.git
$ cd m2p-dump
$ npm install
```

## Configure
```
$ mkdir config
$ touch config/default.json
```
Edit `config/default.json` as follows:
```
{
  "api": {
    "key": "Your Ooyala API Key",
    "secret": "Your Ooyala API Secret"
  }
}
```

## Run
```
$ npm start
```
