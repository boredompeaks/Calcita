import React from 'react';
import { StyleProp, ActivityIndicator, TextStyle } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';
import SimpleLineIcons from 'react-native-vector-icons/SimpleLineIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';

type IconProps = {
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle>;
};

const defaultColor = '#F9FAFB';
const defaultSize = 24;

export const SendIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <MaterialIcons name="send" size={size} color={color} style={style} />
);

export const MoreVerticalIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="more-vertical" size={size} color={color} style={style} />
);

export const CheckIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="check" size={size} color={color} style={style} />
);

export const CheckAllIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <MaterialCommunityIcons name="check-all" size={size} color={color} style={style} />
);

export const CallIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="phone" size={size} color={color} style={style} />
);

export const SunIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="sun" size={size} color={color} style={style} />
);

export const MoonIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="moon" size={size} color={color} style={style} />
);

export const SearchIcon: React.FC<IconProps> = ({ size = 20, color = "#9CA3AF", style }) => (
  <Feather name="search" size={size} color={color} style={style} />
);

export const ArrowLeftIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="arrow-left" size={size} color={color} style={style} />
);

export const SmileIcon: React.FC<IconProps> = ({ size = defaultSize, color = "#9CA3AF", style }) => (
  <Feather name="smile" size={size} color={color} style={style} />
);

export const PaperclipIcon: React.FC<IconProps> = ({ size = defaultSize, color = "#9CA3AF", style }) => (
  <Feather name="paperclip" size={size} color={color} style={style} />
);

export const ViewOnceIcon: React.FC<IconProps> = ({ size = defaultSize, color = "#9CA3AF", style }) => (
  <MaterialCommunityIcons name="timer-sand" size={size} color={color} style={style} />
);

export const MicIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="mic" size={size} color={color} style={style} />
);

export const SpinnerIcon: React.FC<IconProps> = ({ size = 24, color = defaultColor }) => (
  <ActivityIndicator size={size} color={color} />
);

export const XIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="x" size={size} color={color} style={style} />
);

export const LogoutIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
    <SimpleLineIcons name="logout" size={size} color={color} style={style} />
);

export const UsersIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="users" size={size} color={color} style={style} />
);

export const AlertTriangleIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="alert-triangle" size={size} color={color} style={style} />
);

export const EditIcon: React.FC<IconProps> = ({ size = 20, color = defaultColor, style }) => (
  <Feather name="edit-2" size={size} color={color} style={style} />
);

export const ForwardIcon: React.FC<IconProps> = ({ size = 20, color = defaultColor, style }) => (
  <MaterialCommunityIcons name="share-outline" size={size} color={color} style={style} />
);

export const StarIcon: React.FC<IconProps> = ({ size = 20, color = "#FBBF24", style }) => (
  <FontAwesome name="star" size={size} color={color} style={style} />
);

export const StarOutlineIcon: React.FC<IconProps> = ({ size = 20, color = defaultColor, style }) => (
  <FontAwesome name="star-o" size={size} color={color} style={style} />
);

export const ReplyIcon: React.FC<IconProps> = ({ size = 20, color = defaultColor, style }) => (
    <Ionicons name="arrow-undo-sharp" size={size} color={color} style={style} />
);

export const PlayIcon: React.FC<IconProps> = ({ size = 28, color = defaultColor, style }) => (
    <Ionicons name="play" size={size} color={color} style={style} />
);

export const PauseIcon: React.FC<IconProps> = ({ size = 28, color = defaultColor, style }) => (
    <Ionicons name="pause" size={size} color={color} style={style} />
);

export const SparkleIcon: React.FC<IconProps> = ({ size = defaultSize, color = "#9CA3AF", style }) => (
  <Ionicons name="sparkles" size={size} color={color} style={style} />
);

export const MicOffIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="mic-off" size={size} color={color} style={style} />
);

export const VideoIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="video" size={size} color={color} style={style} />
);

export const VideoOffIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="video-off" size={size} color={color} style={style} />
);

export const PhoneOffIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="phone-off" size={size} color={color} style={style} />
);

export const MonitorIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
  <Feather name="monitor" size={size} color={color} style={style} />
);

export const CheckCircleIcon: React.FC<IconProps> = ({ size = defaultSize, color = defaultColor, style }) => (
    <Feather name="check-circle" size={size} color={color} style={style} />
);

export const ClockIcon: React.FC<IconProps> = ({ size = 16, color = "#9CA3AF", style }) => (
  <Feather name="clock" size={size} color={color} style={style} />
);