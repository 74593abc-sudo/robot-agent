Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class W {
  [DllImport("user32.dll")]public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)]public struct RECT{public int Left,Top,Right,Bottom;}
}
"@
$script:results=@()
[W]::EnumWindows({param($h,$l)
  $sb=New-Object System.Text.StringBuilder 256
  [void][W]::GetWindowText($h,$sb,256)
  $t=$sb.ToString()
  $r=New-Object W+RECT
  $vis=[W]::IsWindowVisible($h)
  [void][W]::GetWindowRect($h,[ref]$r)
  if($vis -and $t -ne ""){
    if($t -match "灵珑|LingLong|robot|chat|新手|Electron"){
      $script:results+="$t  ($($r.Left),$($r.Top))-($($r.Right),$($r.Bottom))  $($r.Right-$r.Left)x$($r.Bottom-$r.Top)"
    }
  }
  return $true
},[IntPtr]::Zero) | Out-Null
$script:results | ForEach-Object { Write-Output $_ }
