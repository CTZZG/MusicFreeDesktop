// src/renderer/document/bootstrap.ts
import {localPluginHash, PlayerState, RepeatMode, supportLocalMediaType} from "@/common/constant";
import MusicSheet from "../core/music-sheet";
import trackPlayer from "../core/track-player";
import localMusic from "../core/local-music";
import {setAutoFreeze} from "immer";
import Downloader from "../core/downloader";
import AppConfig from "@shared/app-config/renderer";
import {setupI18n} from "@/shared/i18n/renderer";
import ThemePack from "@/shared/themepack/renderer";
import {addToRecentlyPlaylist, setupRecentlyPlaylist,} from "../core/recently-playlist";
import ServiceManager from "@shared/service-manager/renderer";
import {CurrentTime, PlayerEvents} from "@renderer/core/track-player/enum";
import {appWindowUtil, fsUtil} from "@shared/utils/renderer";
import PluginManager from "@shared/plugin-manager/renderer";
import messageBus from "@shared/message-bus/renderer/main";
import throttle from "lodash.throttle";
import {IAppState} from "@shared/message-bus/type";
import MusicDetail from "@renderer/components/MusicDetail";
import shortCut from "@shared/short-cut/renderer";


setAutoFreeze(false);

export default async function () {
    await Promise.all([
        AppConfig.setup(),
        PluginManager.setup(),
    ]);
    await Promise.all([
        MusicSheet.frontend.setupMusicSheets(),
        trackPlayer.setup(),
    ]);
    await setupI18n();
    shortCut.setup();
    dropHandler();
    clearDefaultBehavior();
    setupCommandAndEvents();
    setupDeviceChange();
    localMusic.setupLocalMusic();
    await Downloader.setup();
    setupRecentlyPlaylist();
    // 本地服务
    ServiceManager.setup();

    // 自动更新插件
    if (AppConfig.getConfig("plugin.autoUpdatePlugin")) {
        const lastUpdated = +(localStorage.getItem("pluginLastupdatedTime") || 0);
        const now = Date.now();
        if (Math.abs(now - lastUpdated) > 86400000) {
            localStorage.setItem("pluginLastupdatedTime", `${now}`);
            PluginManager.updateAllPlugins();
        }
    }

}

function dropHandler() {
    document.addEventListener("drop", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log(event);

        const validMusicList: IMusic.IMusicItem[] = [];
        for (const f of event.dataTransfer.files) {
            if (f.type === "" && (await fsUtil.isFolder(f.path))) {
                validMusicList.push(
                    ...(await PluginManager.callPluginDelegateMethod(
                        {
                            hash: localPluginHash,
                        },
                        "importMusicSheet",
                        f.path
                    ))
                );
            } else if (
                supportLocalMediaType.some((postfix) => f.path.endsWith(postfix))
            ) {
                validMusicList.push(
                    await PluginManager.callPluginDelegateMethod(
                        {
                            hash: localPluginHash,
                        },
                        "importMusicItem",
                        f.path
                    )
                );
            } else if (f.path.endsWith(".mftheme")) {
                // 主题包
                const themeConfig = await ThemePack.installThemePack(f.path);
                if (themeConfig) {
                    await ThemePack.selectTheme(themeConfig);
                }
            }
        }
        if (validMusicList.length) {
            trackPlayer.playMusicWithReplaceQueue(validMusicList);
        }
    });

    document.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
}

function clearDefaultBehavior() {
    const killSpaceBar = function (evt: any) {
        // https://greasyfork.org/en/scripts/25035-disable-space-bar-scrolling/code
        const target = evt.target || {},
            isInput =
                "INPUT" == target.tagName ||
                "TEXTAREA" == target.tagName ||
                "SELECT" == target.tagName ||
                "EMBED" == target.tagName;

        // if we're an input or not a real target exit
        if (isInput || !target.tagName) return;

        // if we're a fake input like the comments exit
        if (
            target &&
            target.getAttribute &&
            target.getAttribute("role") === "textbox"
        )
            return;

        // ignore the space
        if (evt.keyCode === 32) {
            evt.preventDefault();
        }
    };

    document.addEventListener("keydown", killSpaceBar, false);
}


/** 设置事件 */
function setupCommandAndEvents() {
    messageBus.onCommand("SkipToNext", () => {
        trackPlayer.skipToNext();
    });
    messageBus.onCommand("SkipToPrevious", () => {
        trackPlayer.skipToPrev();
    });
    messageBus.onCommand("TogglePlayerState", () => {
        if (trackPlayer.playerState === PlayerState.Playing) {
            trackPlayer.pause();
        } else {
            trackPlayer.resume();
        }
    });
    messageBus.onCommand("SetRepeatMode", (mode) => {
        trackPlayer.setRepeatMode(mode);
    })
    messageBus.onCommand("VolumeUp", (val = 0.04) => {
        trackPlayer.setVolume(Math.min(1, trackPlayer.volume + val))
    });

    messageBus.onCommand("VolumeDown", (val = 0.04) => {
        trackPlayer.setVolume(Math.max(0, trackPlayer.volume - val));
    });

    messageBus.onCommand("ToggleFavorite", async (item) => {
        const realItem = item || trackPlayer.currentMusic;
        if (!realItem) return; // 添加空检查
        if (MusicSheet.frontend.isFavoriteMusic(realItem)) {
            MusicSheet.frontend.removeMusicFromFavorite(realItem);
        } else {
            MusicSheet.frontend.addMusicToFavorite(realItem);
        }
    });

    messageBus.onCommand("ToggleDesktopLyric", () => {
        const enableDesktopLyric = AppConfig.getConfig("lyric.enableDesktopLyric");
        appWindowUtil.setLyricWindow(!enableDesktopLyric);
        AppConfig.setConfig({
            "lyric.enableDesktopLyric": !enableDesktopLyric
        })
    });

    messageBus.onCommand("OpenMusicDetailPage", () => {
        MusicDetail.show();
    });

    messageBus.onCommand("ToggleMainWindowVisible", () => {
        appWindowUtil.toggleMainWindowVisible();
    })


    const sendAppStateTo = (from: "main" | number) => {
        const appState: IAppState = {
            repeatMode: trackPlayer.repeatMode ?? RepeatMode.Queue, // 使用 ?? 提供默认值
            playerState: trackPlayer.playerState ?? PlayerState.None, // 使用 ?? 提供默认值
            musicItem: trackPlayer.currentMusicBasicInfo || null,
            lyricText: trackPlayer.lyric?.currentLrc?.lrc ?? null, // 修改点
            parsedLrc: trackPlayer.lyric?.currentLrc || null,
            fullLyric: trackPlayer.lyric?.parser?.getLyricItems() || [],
            progress: trackPlayer.progress?.currentTime || 0,
            duration: trackPlayer.progress?.duration || 0
        }

        messageBus.syncAppState(appState, from);
    }

    messageBus.onCommand("SyncAppState", (_, from) => {
        sendAppStateTo(from);
    });

    // 初始化完成后发送一次状态
    const initialSync = () => {
        // 由于 isReady 是私有属性，直接发送一次状态，后续依赖事件同步
        sendAppStateTo("main");
        // 这里简单地在 musicChanged 后尝试同步，因为 musicChanged 意味着播放器状态可能已更新
        const readyListener = () => {
            sendAppStateTo("main");
            // 移除监听器，如果 trackPlayer 没有 off 方法，则不移除
            // 如果有 removeListener/on/removeEventListener 方法，请替换下面的注释为实际方法
            // trackPlayer.removeListener?.(PlayerEvents.MusicChanged, readyListener);
        };
        trackPlayer.on(PlayerEvents.MusicChanged, readyListener);
        // 或者如果 trackPlayer 有一个明确的 'ready' 事件，监听那个事件
    };
    initialSync();


    // 状态同步
    trackPlayer.on(PlayerEvents.StateChanged, state => {
        messageBus.syncAppState({
            playerState: state
        });
    });

    trackPlayer.on(PlayerEvents.RepeatModeChanged, mode => {
        messageBus.syncAppState({
            repeatMode: mode
        })
    });

    trackPlayer.on(PlayerEvents.CurrentLyricChanged, lyric => {
        messageBus.syncAppState({
            lyricText: lyric?.lrc ?? null, // 修改点
            parsedLrc: lyric
        });
    })

    trackPlayer.on(PlayerEvents.LyricChanged, lyricParser => {
        messageBus.syncAppState({
            fullLyric: lyricParser?.getLyricItems?.() || []
        })
    })

    const progressChangedHandler = throttle((currentTime: CurrentTime) => {
        messageBus.syncAppState({
            progress: currentTime?.currentTime || 0,
            duration: currentTime.duration || 0,
        });
    }, 800);

    trackPlayer.on(PlayerEvents.ProgressChanged, progressChangedHandler);

    // 最近播放
    trackPlayer.on(PlayerEvents.MusicChanged, (musicItem) => {
        messageBus.syncAppState({
            musicItem,
            lyricText: null,
            fullLyric: [],
            parsedLrc: null,
            progress: 0,
            duration: 0,
        });
        if (musicItem) { // 确保 musicItem 不为 null
           addToRecentlyPlaylist(musicItem);
        }
    });
}

async function setupDeviceChange() {
    const getAudioDevices = async (): Promise<MediaDeviceInfo[]> =>
        await navigator.mediaDevices.enumerateDevices().catch((): MediaDeviceInfo[] => []);
    let devices = (await getAudioDevices()) || [];

    navigator.mediaDevices.ondevicechange = async (_evt) => { // evt 参数未使用，可以标记为 _evt
        const newDevices = await getAudioDevices();
        if (
            newDevices.length < devices.length &&
            AppConfig.getConfig("playMusic.whenDeviceRemoved") === "pause"
        ) {
            trackPlayer.pause();
        }
        devices = newDevices;
    };
}