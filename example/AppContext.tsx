import React from 'react';
import {
  auth,
  remote,
  ApiConfig,
  ApiScope,
  SpotifyRemoteApi,
  PlayerState,
  PlayerContext,
  RepeatMode,
  ContentItem,
  SpotifyAuth,
} from 'react-native-spotify-remote';
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URL,
  SPOTIFY_TOKEN_REFRESH_URL,
  SPOTIFY_TOKEN_SWAP_URL,
} from 'react-native-dotenv';

interface AuthOptions {
  playURI?: string;
  showDialog?: boolean;
  autoConnect?: boolean;
  authType?: ApiConfig['authType'];
}

interface AppContextState {
  error?: Error & {code?: any};
  playerState: PlayerState;
  prevPlayerState: null | PlayerState;
  token?: string;
  isConnected?: boolean;
  refreshToken: null | string;
  chosenPlayListItem: ContentItem | null;
  trackID: null | string;
}

export interface AppContextProps extends AppContextState {
  onError: (err: Error) => void;
  setChosenPlayListItem: (item: ContentItem | null) => void;
  setTrackID: (uri: null | string) => void;
  authenticate: (options?: AuthOptions) => void;
  clearError: () => void;
  endSession: () => void;
  remote: SpotifyRemoteApi;
  auth: SpotifyAuth;
}
//g
const noop = () => {};
const DefaultContext: Partial<AppContextProps> = {
  onError: noop,
  authenticate: noop,
  clearError: noop,
  endSession: noop,
  setTrackID: noop,
  setChosenPlayListItem: noop,
  remote,
  auth,
};

const AppContext = React.createContext<AppContextProps>(
  DefaultContext as AppContextProps,
);

class AppContextProvider extends React.Component<{}, AppContextState> {
  state = {
    isConnected: false,
    refreshToken: null,
    trackID: '',
    chosenPlayListItem: null,
    playerState: {
      isPaused: false,
      playbackOptions: {
        isShuffling: false,
        repeatMode: RepeatMode.Off,
      },
      playbackPosition: 0,
      playbackRestrictions: {
        canRepeatContext: true,
        canRepeatTrack: true,
        canSkipNext: true,
        canSkipPrevious: true,
        canToggleShuffle: true,
      },
      track: {
        duration: 0,
        name: '',
        uri: '',
        artist: {name: ''},
      },
    },
    prevPlayerState: null,
  };

  constructor(props: any) {
    super(props);
    this.onError = this.onError.bind(this);
    this.authenticate = this.authenticate.bind(this);
    this.clearError = this.clearError.bind(this);
    this.onConnected = this.onConnected.bind(this);
    this.onDisconnected = this.onDisconnected.bind(this);
    this.onPlayerStateChanged = this.onPlayerStateChanged.bind(this);
    this.onPlayerContextChanged = this.onPlayerContextChanged.bind(this);
    this.endSession = this.endSession.bind(this);
    this.setTrackID = this.setTrackID.bind(this);
    this.setChosenPlayListItem = this.setChosenPlayListItem.bind(this);
  }

  componentDidMount() {
    console.log('DIDMOUNTTTTTTTTTTTT');
    try {
      this.onPlayerStateChanged();
      remote.on('remoteConnected', this.onConnected);
      remote.on('remoteDisconnected', this.onDisconnected);
      setInterval(this.onPlayerStateChanged, 500);
      //remote.addListener('playerStateChanged', this.onPlayerStateChanged);
      remote.on('playerContextChanged', this.onPlayerContextChanged);
    } catch (err) {
      console.log('ERROR IN DIDMOUNT ', err);
    }
    auth.getSession().then((session) => {
      if (session != undefined && session.accessToken != undefined) {
        this.setState((state) => ({...state, token: session.accessToken}));
        remote
          .connect(session.accessToken)
          .then(() =>
            this.setState((state) => ({
              ...state,
              isConnected: true,
            })),
          )
          .catch(this.onError);
      }
    });
  }

  componentWillUnmount() {
    remote.removeAllListeners();
  }

  private onError(error: Error) {
    this.setState((state) => ({...state, error}));
  }

  private clearError() {
    this.setState((state) => ({...state, error: undefined}));
  }
  private setTrackID(id: null | string) {
    console.log('IN CONTEXT CHANGING URI!!');
    return new Promise<string | null>((resolve) =>
      this.setState(
        (state) => ({...state, trackID: id}),
        () => resolve(this.state.trackID),
      ),
    );
  }
  private setChosenPlayListItem(item: ContentItem | null) {
    return new Promise<ContentItem | null>((resolve) =>
      this.setState(
        (state) => ({...state, chosenPlayListItem: item}),
        () => resolve(this.state.chosenPlayListItem),
      ),
    );
  }

  private onConnected() {
    this.setState((state) => ({
      ...state,
      isConnected: true,
    }));
  }

  private onDisconnected() {
    auth.getSession().then((res) => {
      console.log('session:', res);
      res &&
        remote
          .connect(res?.accessToken)
          .then((p) => console.log('res connect:::::', p))
          .catch((err) => console.log('ERRRRRR     ', err));
    });
    this.setState((state) => ({
      ...state,
      isConnected: false,
    }));
  }

  private async onPlayerStateChanged() {
    try {
      const currentPlayerState = await remote.getPlayerState();
      console.log(
        'SONG!!!! ',
        currentPlayerState.track.uri,
        this.state.playerState.track.uri,
      );
      let prevState = null;
      if (
        this.state.playerState.track.uri &&
        currentPlayerState.track.uri != this.state.playerState.track.uri
      ) {
        console.log('NEXT SONG!!!!! ', this.state.playerState.track.name);
        prevState = this.state.playerState;
      }
      // this.state.playerState.
      this.setState((state) => ({
        ...state,
        playerState: currentPlayerState,
      }));
      prevState && this.setState({prevPlayerState: prevState});
    } catch (err) {
      console.log('err: ', err);
    }
  }

  private onPlayerContextChanged(playerContext: PlayerContext) {
    console.log('Context!!!', playerContext);
    this.setState((state) => ({
      ...state,
      playerContext,
    }));
  }

  private endSession() {
    auth.endSession().then(() => {
      remote.disconnect().then(() => {
        this.setState({isConnected: false, token: undefined});
      });
    });
  }

  private async authenticate({
    playURI,
    showDialog = false,
    authType,
  }: AuthOptions = {}) {
    const config: ApiConfig = {
      clientID: SPOTIFY_CLIENT_ID,
      redirectURL: SPOTIFY_REDIRECT_URL,
      tokenRefreshURL: SPOTIFY_TOKEN_REFRESH_URL,
      tokenSwapURL: SPOTIFY_TOKEN_SWAP_URL,
      scopes: [ApiScope.AppRemoteControlScope],
      playURI,
      showDialog,
      authType,
    };

    try {
      // Go and check if things are connected
      const isConnected = await remote.isConnectedAsync();
      this.setState((state) => ({
        ...state,
        isConnected,
      }));

      // Initialize the session
      const {accessToken: token, refreshToken} = await auth.authorize(config);
      this.setState((state) => ({
        ...state,
        token,
        refreshToken,
      }));
      await remote.connect(token);
    } catch (err) {
      console.log('Error remote.connect ', err);
      this.onError(err);
    }
  }

  render() {
    const {children} = this.props;
    return (
      <AppContext.Provider
        value={{
          ...(DefaultContext as AppContextProps),
          ...this.state,
          onError: this.onError,
          authenticate: this.authenticate,
          clearError: this.clearError,
          endSession: this.endSession,
          setTrackID: this.setTrackID,
          setChosenPlayListItem: this.setChosenPlayListItem,
        }}>
        {children}
      </AppContext.Provider>
    );
  }
}

export default AppContext;
export {AppContextProvider};
