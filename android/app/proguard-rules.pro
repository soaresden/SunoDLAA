# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class com.soaresden.sunoauto.**$$serializer { *; }
-keepclassmembers class com.soaresden.sunoauto.** { *** Companion; }
-keepclasseswithmembers class com.soaresden.sunoauto.** { kotlinx.serialization.KSerializer serializer(...); }
