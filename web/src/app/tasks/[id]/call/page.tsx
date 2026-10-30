"use client";

import { ArrowLeft, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Video, VideoOff } from "lucide-react";
import type { LocalAudioTrack, LocalVideoTrack, Room, Track } from "livekit-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRequireRole } from "@/components/auth";
import { Button, Sheet, Skeleton } from "@/components/ui";
import { api, ApiError, type Schemas } from "@/lib/api";

type Join = Schemas["VideoJoinOut"];
type Status = Schemas["VideoStatusOut"];
type Phase =
  | "loading"
  | "unavailable"
  | "not-open"
  | "preview"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "demo"
  | "left"
  | "ended"
  | "error";
type Remote = { key: string; name: string; source: string; track: Track };

// The fake provider's URL uses the reserved .invalid TLD: nothing to connect to.
const isDemo = (url: string) => new URL(url).hostname.endsWith(".invalid");
const canShareScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

/** Attaches a LiveKit track to a <video>/<audio> element for as long as it is mounted. */
function TrackView({
  track,
  muted,
  className,
  testId,
}: {
  track: Track;
  muted?: boolean;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  if (track.kind === "audio") return <audio ref={ref} autoPlay />;
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} data-testid={testId} />;
}

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useRequireRole();
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [cam, setCam] = useState<LocalVideoTrack | null>(null);
  const [mic, setMic] = useState<LocalAudioTrack | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const room = useRef<Room | null>(null);
  const local = useRef<{ cam: LocalVideoTrack | null; mic: LocalAudioTrack | null }>({ cam: null, mic: null });

  // 1. Is there a session for me? Then a device preview (permission problems are not fatal).
  useEffect(() => {
    if (!me) return;
    let live = true;
    (async () => {
      let s: Status;
      try {
        s = await api<Status>(`/tasks/${id}/video`);
      } catch {
        if (live) setPhase("unavailable");
        return;
      }
      if (s.status === "ended") return live && setPhase("ended");
      if (!s.joinable) return live && setPhase("not-open");
      const lk = await import("livekit-client");
      const res = lk.VideoPresets.h720.resolution;
      let tracks: (LocalVideoTrack | LocalAudioTrack)[] = [];
      try {
        tracks = (await lk.createLocalTracks({ audio: true, video: { resolution: res } })) as typeof tracks;
      } catch {
        try {
          tracks = (await lk.createLocalTracks({ audio: true, video: false })) as typeof tracks;
          setNotice("Your camera is blocked or unavailable. You can still join with audio.");
        } catch {
          setNotice("Camera and microphone are blocked. You can still join to watch and listen.");
        }
      }
      if (!live) return tracks.forEach((t) => t.stop());
      const v = (tracks.find((t) => t.kind === "video") as LocalVideoTrack | undefined) ?? null;
      const a = (tracks.find((t) => t.kind === "audio") as LocalAudioTrack | undefined) ?? null;
      local.current = { cam: v, mic: a };
      setCam(v);
      setMic(a);
      setCamOn(!!v);
      setMicOn(!!a);
      setPhase("preview");
    })();
    return () => {
      live = false;
    };
  }, [me, id]);

  // Always release devices and the connection when leaving the page.
  useEffect(
    () => () => {
      void room.current?.disconnect();
      local.current.cam?.stop();
      local.current.mic?.stop();
    },
    [],
  );

  const syncRemotes = useCallback((r: Room) => {
    const next: Remote[] = [];
    for (const p of r.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.track && pub.isSubscribed) {
          next.push({
            key: `${p.identity}:${pub.trackSid}`,
            name: p.name || "Participant",
            source: pub.source,
            track: pub.track,
          });
        }
      }
    }
    setRemotes(next);
  }, []);

  const join = useCallback(async () => {
    setPhase("connecting");
    let j: Join;
    try {
      j = await api<Join>(`/tasks/${id}/video/join`, { method: "POST" });
    } catch (e) {
      setPhase(e instanceof ApiError && e.status === 409 ? "ended" : "error");
      return;
    }
    if (isDemo(j.url)) return setPhase("demo");
    const lk = await import("livekit-client");
    // Light on the server: the SFU forwards only the layers each viewer can actually display.
    const r = new lk.Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: lk.VideoPresets.h720.resolution },
      publishDefaults: { simulcast: true, screenShareEncoding: lk.ScreenSharePresets.h1080fps15.encoding },
    });
    room.current = r;
    r.on(lk.RoomEvent.TrackSubscribed, () => syncRemotes(r))
      .on(lk.RoomEvent.TrackUnsubscribed, () => syncRemotes(r))
      .on(lk.RoomEvent.ParticipantDisconnected, () => syncRemotes(r))
      .on(lk.RoomEvent.Reconnecting, () => setPhase("reconnecting"))
      .on(lk.RoomEvent.Reconnected, () => setPhase("connected"))
      .on(lk.RoomEvent.LocalTrackUnpublished, (pub) => {
        // "Stop sharing" from the browser's own bar ends the share, not the call.
        if (pub.source === lk.Track.Source.ScreenShare) setSharing(false);
      })
      .on(lk.RoomEvent.Disconnected, (reason) => {
        setRemotes([]);
        setPhase(reason === lk.DisconnectReason.ROOM_DELETED ? "ended" : "left");
      });
    try {
      await r.connect(j.url, j.token);
      for (const t of [local.current.cam, local.current.mic]) if (t) await r.localParticipant.publishTrack(t);
      syncRemotes(r);
      setPhase("connected");
    } catch {
      setPhase("error");
    }
  }, [id, syncRemotes]);

  const toggleCam = async () => {
    if (!cam) return;
    if (camOn) await cam.mute();
    else await cam.unmute();
    setCamOn(!camOn);
  };
  const toggleMic = async () => {
    if (!mic) return;
    if (micOn) await mic.mute();
    else await mic.unmute();
    setMicOn(!micOn);
  };
  const toggleShare = async () => {
    const r = room.current;
    if (!r) return;
    try {
      const lk = await import("livekit-client");
      await r.localParticipant.setScreenShareEnabled(!sharing, {
        audio: true,
        resolution: lk.ScreenSharePresets.h1080fps15.resolution,
        contentHint: "detail",
      });
      setSharing(!sharing);
    } catch {
      // The person closed the share picker: keep the call going.
      setSharing(false);
    }
  };
  const leave = async () => {
    await room.current?.disconnect();
    setPhase("left");
  };
  const end = async () => {
    try {
      await api(`/tasks/${id}/video/end`, { method: "POST" });
    } finally {
      await room.current?.disconnect();
      local.current.cam?.stop();
      local.current.mic?.stop();
      setPhase("ended");
    }
  };

  const back = (
    <Link
      href={`/tasks/${id}`}
      className="mb-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-ink"
    >
      <ArrowLeft size={15} strokeWidth={2} aria-hidden /> Back to the session
    </Link>
  );

  if (!me || phase === "loading") return <Skeleton lines={4} />;
  const message = {
    unavailable: "This video session isn't available to you.",
    "not-open": "Video opens once the session is paid.",
    ended: "This video session has ended.",
    left: "You left the call. You can rejoin while the session is open.",
    error: "We couldn't connect the call. Check your connection and try again.",
  }[phase as string];
  if (message) {
    return (
      <div>
        {back}
        <Sheet className="p-6">
          <p className="text-[16px] text-ink">{message}</p>
          {phase === "left" || phase === "error" ? (
            <Button className="mt-4" onClick={join}>
              Rejoin
            </Button>
          ) : null}
        </Sheet>
      </div>
    );
  }

  const inCall = phase === "connected" || phase === "reconnecting" || phase === "demo";
  const share = remotes.find((t) => t.source === "screen_share");
  const remoteCams = remotes.filter((t) => t.source === "camera");
  const remoteAudio = remotes.filter((t) => t.track.kind === "audio");

  return (
    <div>
      {back}
      {phase === "demo" && (
        <p className="mb-4 rounded-[7px] bg-attention-soft px-4 py-3 text-[14px] text-attention">
          <strong>Demo mode</strong>: the video server isn&apos;t connected in this demo, so this is a local preview
          only. Calls connect once the live video server is switched on.
        </p>
      )}
      {phase === "reconnecting" && (
        <p className="mb-4 rounded-[7px] bg-attention-soft px-4 py-3 text-[14px] text-attention" role="status">
          Connection dropped. Reconnecting…
        </p>
      )}
      {notice && <p className="mb-4 text-[14px] text-muted">{notice}</p>}

      {/* Stage: a shared screen takes the room; cameras become secondary tiles. */}
      <div className="grid gap-3">
        {share && (
          <div className="overflow-hidden rounded-[10px] bg-ink">
            <TrackView track={share.track} className="aspect-video w-full object-contain" testId="remote-screen" />
            <div className="px-3 py-1.5 text-[13px] text-white/80">{share.name} is sharing their screen</div>
          </div>
        )}
        <div className={share ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "grid gap-3 sm:grid-cols-2"}>
          {remoteCams.map((t) => (
            <div key={t.key} className="overflow-hidden rounded-[10px] bg-ink">
              <TrackView track={t.track} className="aspect-video w-full object-cover" testId="remote-camera" />
              <div className="px-3 py-1.5 text-[13px] text-white/80">{t.name}</div>
            </div>
          ))}
          <div className="overflow-hidden rounded-[10px] bg-ink">
            {cam ? (
              <TrackView
                track={cam}
                muted
                className="aspect-video w-full -scale-x-100 object-cover"
                testId="local-preview"
              />
            ) : (
              <div data-testid="local-preview" className="flex aspect-video items-center justify-center text-white/70">
                Camera off
              </div>
            )}
            <div className="px-3 py-1.5 text-[13px] text-white/80">You</div>
          </div>
        </div>
        {inCall && phase !== "demo" && remoteCams.length === 0 && !share && (
          <p className="text-[14px] text-muted">Waiting for the other person to join…</p>
        )}
        {remoteAudio.map((t) => (
          <TrackView key={t.key} track={t.track} />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={toggleCam}
          disabled={!cam}
          aria-label={camOn ? "Turn camera off" : "Turn camera on"}
        >
          {camOn ? <Video size={17} aria-hidden /> : <VideoOff size={17} aria-hidden />}
          <span className="hidden sm:inline">{camOn ? "Camera on" : "Camera off"}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={toggleMic}
          disabled={!mic}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <Mic size={17} aria-hidden /> : <MicOff size={17} aria-hidden />}
          <span className="hidden sm:inline">{micOn ? "Mic on" : "Muted"}</span>
        </Button>
        {phase === "connected" && canShareScreen() && (
          <Button variant="secondary" onClick={toggleShare}>
            {sharing ? <MonitorX size={17} aria-hidden /> : <MonitorUp size={17} aria-hidden />}
            {sharing ? "Stop sharing" : "Share screen"}
          </Button>
        )}
        {phase === "preview" || phase === "connecting" ? (
          <Button onClick={join} loading={phase === "connecting"}>
            Join session
          </Button>
        ) : (
          <>
            {phase !== "demo" && (
              <Button variant="secondary" onClick={leave}>
                Leave
              </Button>
            )}
            <Button variant="danger" onClick={end}>
              <PhoneOff size={17} aria-hidden /> End session
            </Button>
          </>
        )}
      </div>
      {!canShareScreen() && (
        <p className="mt-3 text-[13px] text-muted">
          Screen sharing needs a computer browser. On this device you can still see a shared screen.
        </p>
      )}
    </div>
  );
}
